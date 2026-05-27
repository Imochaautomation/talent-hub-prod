import { prisma } from '../lib/prisma';
import { cacheGet, cacheSet, cacheDel } from '../lib/redis';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import logger from '../lib/logger';
import { BAND_ORDER } from '../types/index';

export const benefitsService = {
  getCatalog: async () => {
    const cached = await cacheGet<any[]>('benefits:catalog');
    if (cached) return cached;
    const benefits = await prisma.benefitsCatalog.findMany({
      where: { isActive: true },
      orderBy: { category: 'asc' },
    });
    const result = benefits.map(b => ({
      ...b,
      annualValue: Number(b.annualValue),
      eligibilityCriteria: b.eligibilityCriteria as any,
    }));
    await cacheSet('benefits:catalog', result, 300);
    return result;
  },

  getUtilization: async () => {
    const cached = await cacheGet<any>('benefits:utilization');
    if (cached) return cached;
    const benefits = await prisma.benefitsCatalog.findMany({
      where: { isActive: true },
      include: {
        employeeBenefits: {
          where: { status: 'ACTIVE' },
          select: { utilizationPercent: true, utilizedValue: true },
        },
      },
    });
    const result = benefits.map(b => {
      const enrolledCount = b.employeeBenefits.length;
      const avgUtil = enrolledCount > 0
        ? b.employeeBenefits.reduce((s, e) => s + Number(e.utilizationPercent || 0), 0) / enrolledCount
        : 0;
      const totalUtilized = b.employeeBenefits.reduce((s, e) => s + Number(e.utilizedValue || 0), 0);
      return {
        id: b.id,
        name: b.name,
        category: b.category,
        annualValue: Number(b.annualValue),
        enrolledCount,
        avgUtilization: Math.round(avgUtil),
        totalUtilized,
      };
    });
    await cacheSet('benefits:utilization', result, 120);
    return result;
  },

  getEnrollments: async (filters: Record<string, string> = {}) => {
    const where: any = {};
    if (filters.benefitId) where.benefitId = filters.benefitId;
    if (filters.status) where.status = filters.status;
    const enrollments = await prisma.employeeBenefit.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, department: true, band: true, designation: true } },
        benefit: { select: { id: true, name: true, category: true, annualValue: true } },
      },
      orderBy: { enrolledAt: 'desc' },
    });
    return enrollments.map(e => ({
      ...e,
      utilizationPercent: Number(e.utilizationPercent),
      utilizedValue: Number(e.utilizedValue),
      benefit: { ...e.benefit, annualValue: Number(e.benefit.annualValue) },
    }));
  },

  checkEligibility: async (employeeId: string, benefitId: string) => {
    const [employee, benefit] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: employeeId },
        include: { performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 } },
      }),
      prisma.benefitsCatalog.findUnique({ where: { id: benefitId } }),
    ]);
    if (!employee || !benefit) throw new Error('Employee or benefit not found');
    const criteria = benefit.eligibilityCriteria as any;
    const failed: string[] = [];
    if (criteria?.minBand) {
      if ((BAND_ORDER as readonly string[]).indexOf(employee.band) < (BAND_ORDER as readonly string[]).indexOf(criteria.minBand)) {
        failed.push(`Requires band ${criteria.minBand}+`);
      }
    }
    if (criteria?.minTenure) {
      const tenureMonths = Math.floor((Date.now() - new Date(employee.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30));
      if (tenureMonths < criteria.minTenure) {
        failed.push(`Requires ${criteria.minTenure} months tenure (current: ${tenureMonths}mo)`);
      }
    }
    if (criteria?.minRating) {
      const lastRating = Number(employee.performanceRatings[0]?.rating || 0);
      if (lastRating < criteria.minRating) {
        failed.push(`Requires performance rating >= ${criteria.minRating}`);
      }
    }
    if (criteria?.employmentTypes && !criteria.employmentTypes.includes(employee.employmentType)) {
      failed.push(`Requires employment type: ${criteria.employmentTypes.join(', ')}`);
    }
    return { isEligible: failed.length === 0, failedCriteria: failed };
  },

  enroll: async (employeeId: string, benefitId: string) => {
    const eligibility = await benefitsService.checkEligibility(employeeId, benefitId);
    if (!eligibility.isEligible) {
      throw Object.assign(new Error('Employee not eligible'), { statusCode: 400, details: eligibility.failedCriteria });
    }
    const result = await prisma.employeeBenefit.create({
      data: { employeeId, benefitId, enrolledAt: new Date(), status: 'ACTIVE', utilizationPercent: 0, utilizedValue: 0 },
    });
    await Promise.allSettled([cacheDel('benefits:utilization')]);
    return result;
  },

  importUtilizationData: async (buffer: Buffer, mimetype: string): Promise<{ updated: number; failed: number; errors: string[] }> => {
    let rawRows: Record<string, any>[];
    // Detect CSV by content if MIME is ambiguous (some browsers send application/vnd.ms-excel for .csv)
    const bufStr = buffer.subarray(0, 4).toString('hex');
    const isExcelBinary = bufStr === '504b0304' || bufStr === 'd0cf11e0'; // xlsx (PK) or xls (OLE)
    if (!isExcelBinary && (mimetype === 'text/csv' || mimetype === 'application/csv' || mimetype === 'text/plain' || mimetype === 'application/vnd.ms-excel')) {
      rawRows = parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    } else {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    }

    const [benefits, allEmployees] = await Promise.all([
      prisma.benefitsCatalog.findMany({ select: { id: true, name: true } }),
      // Pre-fetch all employees to avoid N+1 per-row DB lookup (N2 fix)
      prisma.employee.findMany({ select: { id: true, employeeId: true, email: true } }),
    ]);
    // Two normalization strategies: spaces-only and all-non-alphanumeric
    const norm1 = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    const norm2 = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const benefitMap1 = new Map(benefits.map(b => [norm1(b.name), b.id]));
    const benefitMap2 = new Map(benefits.map(b => [norm2(b.name), b.id]));
    const employeeByEmpId = new Map(allEmployees.map(e => [e.employeeId, e.id]));
    const employeeByEmail = new Map(allEmployees.filter(e => e.email != null).map(e => [e.email!.toLowerCase(), e.id]));

    let updated = 0; let failed = 0; const errors: string[] = [];

    // Log column names from first row for diagnostics
    if (rawRows.length > 0) {
      const cols = Object.keys(rawRows[0]);
      logger.debug('[benefits:import] CSV columns found: %o', cols);
    }

    for (const row of rawRows) {
      try {
        const empIdRaw = String(row.employeeId || row.employee_id || row['Employee ID'] || row['employee id'] || row.email || '').trim();
        const benefitName = String(row.benefitName || row.benefit_name || row['Benefit Name'] || row['benefit name'] || row['BENEFIT NAME'] || row.benefit || '').trim();
        const utilPct = parseFloat(String(row.utilizationPercent || row.utilization_percent || row['Utilization %'] || row['utilization%'] || row.utilization || 0));
        const utilValue = parseFloat(String(row.utilizedValue || row.utilized_value || row['Utilized Value'] || row['utilized value'] || row.amount || 0));

        if (!empIdRaw || !benefitName) { failed++; errors.push(`Row skipped: missing employeeId or benefitName`); continue; }

        const employeeId = employeeByEmpId.get(empIdRaw) ?? employeeByEmail.get(empIdRaw.toLowerCase());
        if (!employeeId) { failed++; errors.push(`Employee not found: ${empIdRaw}`); continue; }

        const benefitId = benefitMap1.get(norm1(benefitName)) ?? benefitMap2.get(norm2(benefitName));
        if (!benefitId) { failed++; errors.push(`Benefit not found: ${benefitName}`); continue; }

        await prisma.employeeBenefit.upsert({
          where: { employeeId_benefitId: { employeeId, benefitId } },
          update: { utilizationPercent: isNaN(utilPct) ? 0 : utilPct, utilizedValue: isNaN(utilValue) ? 0 : utilValue, status: 'ACTIVE' },
          create: { employeeId, benefitId, enrolledAt: new Date(), status: 'ACTIVE', utilizationPercent: isNaN(utilPct) ? 0 : utilPct, utilizedValue: isNaN(utilValue) ? 0 : utilValue },
        });
        updated++;
      } catch (err: any) {
        failed++; errors.push(err?.message || 'Unknown error');
      }
    }

    await cacheDel('benefits:utilization');
    return { updated, failed, errors };
  },

  getCategorySummary: async () => {
    const byCategory = await prisma.benefitsCatalog.findMany({
      where: { isActive: true },
      include: { employeeBenefits: { where: { status: 'ACTIVE' }, select: { utilizedValue: true } } },
    });
    return byCategory.reduce((acc: any[], b) => {
      const cat = acc.find(c => c.category === b.category);
      const spend = b.employeeBenefits.reduce((s, e) => s + Number(e.utilizedValue || 0), 0);
      if (cat) { cat.count++; cat.totalSpend += spend; }
      else acc.push({ category: b.category, count: 1, totalSpend: spend });
      return acc;
    }, []);
  },
};
