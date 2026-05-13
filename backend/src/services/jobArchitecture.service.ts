import { prisma } from '../lib/prisma';
import { emitSalaryBandUpdated } from '../lib/socket';
import { cacheDelPattern } from '../lib/redis';
import type {
  CreateJobAreaInput,
  UpdateJobAreaInput,
  CreateJobFamilyInput,
  UpdateJobFamilyInput,
  CreateBandInput,
  UpdateBandInput,
  CreateGradeInput,
  UpdateGradeInput,
  CreateJobCodeInput,
  UpdateJobCodeInput,
} from '../schemas/jobArchitecture.schemas';

// ─── ServiceError helper ──────────────────────────────────────
class ServiceError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new ServiceError(409, code, message, details);
const notFound = (code: string, message: string) => new ServiceError(404, code, message);

export const jobArchitectureService = {
  // ─── Hierarchy ────────────────────────────────────────────────
  getHierarchy: async () => {
    return prisma.jobArea.findMany({
      include: {
        jobFamilies: {
          orderBy: { name: 'asc' },
          include: {
            jobCodes: {
              orderBy: [{ band: { level: 'asc' } }, { code: 'asc' }],
              include: {
                band: true,
                grade: true,
                employees: {
                  select: { id: true, firstName: true, lastName: true },
                  orderBy: { firstName: 'asc' },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  },

  // ─── JobArea ──────────────────────────────────────────────────
  getJobAreas: async () => prisma.jobArea.findMany({ orderBy: { name: 'asc' } }),

  createJobArea: async (data: CreateJobAreaInput) => {
    const existing = await prisma.jobArea.findFirst({
      where: { name: { equals: data.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw conflict('AREA_NAME_EXISTS', `A job area named "${data.name}" already exists`, { existingId: existing.id });
    }
    return prisma.jobArea.create({ data });
  },

  updateJobArea: async (id: string, data: UpdateJobAreaInput) => {
    await prisma.jobArea.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw notFound('AREA_NOT_FOUND', 'Job area not found');
    });
    if (data.name) {
      const existing = await prisma.jobArea.findFirst({
        where: { name: { equals: data.name, mode: 'insensitive' }, NOT: { id } },
      });
      if (existing) {
        throw conflict('AREA_NAME_EXISTS', `A job area named "${data.name}" already exists`);
      }
    }
    return prisma.jobArea.update({ where: { id }, data });
  },

  deleteJobArea: async (id: string) => {
    return prisma.$transaction(async (tx) => {
      const familyCount = await tx.jobFamily.count({ where: { jobAreaId: id } });
      if (familyCount > 0) {
        const employeeCount = await tx.employee.count({
          where: { jobCode: { jobFamily: { jobAreaId: id } } },
        });
        throw conflict(
          'AREA_IN_USE',
          `Cannot delete job area — ${familyCount} family/families` +
            (employeeCount > 0 ? ` and ${employeeCount} employee(s)` : '') +
            ' still reference it',
          { familyCount, employeeCount },
        );
      }
      return tx.jobArea.delete({ where: { id } });
    });
  },

  // ─── JobFamily ────────────────────────────────────────────────
  getJobFamilies: async (jobAreaId?: string) =>
    prisma.jobFamily.findMany({
      where: jobAreaId ? { jobAreaId } : undefined,
      include: { jobArea: true },
      orderBy: { name: 'asc' },
    }),

  createJobFamily: async (data: CreateJobFamilyInput) => {
    const area = await prisma.jobArea.findUnique({ where: { id: data.jobAreaId } });
    if (!area) throw notFound('AREA_NOT_FOUND', 'Job area not found');
    const existing = await prisma.jobFamily.findFirst({
      where: { name: { equals: data.name, mode: 'insensitive' }, jobAreaId: data.jobAreaId },
    });
    if (existing) {
      throw conflict('FAMILY_NAME_EXISTS', `A family named "${data.name}" already exists in this area`);
    }
    return prisma.jobFamily.create({ data });
  },

  updateJobFamily: async (id: string, data: UpdateJobFamilyInput) => {
    const family = await prisma.jobFamily.findUnique({ where: { id } });
    if (!family) throw notFound('FAMILY_NOT_FOUND', 'Job family not found');
    if (data.name) {
      const existing = await prisma.jobFamily.findFirst({
        where: {
          name: { equals: data.name, mode: 'insensitive' },
          jobAreaId: family.jobAreaId,
          NOT: { id },
        },
      });
      if (existing) {
        throw conflict('FAMILY_NAME_EXISTS', `A family named "${data.name}" already exists in this area`);
      }
    }
    return prisma.jobFamily.update({ where: { id }, data });
  },

  deleteJobFamily: async (id: string) => {
    return prisma.$transaction(async (tx) => {
      const jobCodeCount = await tx.jobCode.count({ where: { jobFamilyId: id } });
      if (jobCodeCount > 0) {
        const employeeCount = await tx.employee.count({ where: { jobCode: { jobFamilyId: id } } });
        throw conflict(
          'FAMILY_IN_USE',
          `Cannot delete family — ${jobCodeCount} role(s)` +
            (employeeCount > 0 ? ` and ${employeeCount} employee(s)` : '') +
            ' still reference it',
          { jobCodeCount, employeeCount },
        );
      }
      return tx.jobFamily.delete({ where: { id } });
    });
  },

  // ─── Band ─────────────────────────────────────────────────────
  getBands: async () => prisma.band.findMany({ orderBy: { level: 'asc' } }),

  createBand: async (data: CreateBandInput) => {
    const dup = await prisma.band.findFirst({
      where: { OR: [{ code: data.code }, { level: data.level }] },
    });
    if (dup) {
      if (dup.code === data.code) {
        throw conflict('BAND_CODE_EXISTS', `Band code "${data.code}" already exists`);
      }
      throw conflict('BAND_LEVEL_EXISTS', `Band level ${data.level} already exists (band ${dup.code})`);
    }
    const created = await prisma.band.create({ data });
    await cacheDelPattern('salary-bands:*');
    emitSalaryBandUpdated();
    return created;
  },

  updateBand: async (id: string, data: UpdateBandInput) => {
    const band = await prisma.band.findUnique({ where: { id } });
    if (!band) throw notFound('BAND_NOT_FOUND', 'Band not found');
    if (data.code && data.code !== band.code) {
      const dup = await prisma.band.findFirst({ where: { code: data.code, NOT: { id } } });
      if (dup) throw conflict('BAND_CODE_EXISTS', `Band code "${data.code}" already exists`);
    }
    if (data.level !== undefined && data.level !== band.level) {
      const dup = await prisma.band.findFirst({ where: { level: data.level, NOT: { id } } });
      if (dup) throw conflict('BAND_LEVEL_EXISTS', `Band level ${data.level} already exists`);
    }
    const updated = await prisma.band.update({ where: { id }, data });
    await cacheDelPattern('salary-bands:*');
    emitSalaryBandUpdated();
    return updated;
  },

  deleteBand: async (id: string) => {
    const band = await prisma.band.findUnique({ where: { id } });
    if (!band) throw notFound('BAND_NOT_FOUND', 'Band not found');

    const [employeeCount, jobCodeCount, gradeCount, salaryBandCount] = await Promise.all([
      prisma.employee.count({ where: { band: band.code } }),
      prisma.jobCode.count({ where: { bandId: id } }),
      prisma.grade.count({ where: { bandId: id } }),
      prisma.salaryBand.count({ where: { bandId: id } }),
    ]);

    if (employeeCount > 0) {
      throw conflict(
        'BAND_IN_USE',
        `Cannot delete band ${band.code} — ${employeeCount} employee(s) assigned to it`,
        { employeeCount, jobCodeCount, gradeCount, salaryBandCount },
      );
    }
    if (jobCodeCount > 0) {
      throw conflict(
        'BAND_IN_USE',
        `Cannot delete band ${band.code} — ${jobCodeCount} job code(s) reference it`,
        { employeeCount, jobCodeCount, gradeCount, salaryBandCount },
      );
    }
    if (gradeCount > 0) {
      throw conflict(
        'BAND_IN_USE',
        `Cannot delete band ${band.code} — ${gradeCount} grade(s) defined under it`,
        { employeeCount, jobCodeCount, gradeCount, salaryBandCount },
      );
    }
    if (salaryBandCount > 0) {
      throw conflict(
        'BAND_HAS_SALARY_BANDS',
        `Cannot delete band ${band.code} — ${salaryBandCount} salary band(s) reference it. Delete those first.`,
        { employeeCount, jobCodeCount, gradeCount, salaryBandCount },
      );
    }

    const deleted = await prisma.$transaction(async (tx) => {
      // Null out optional FK on market benchmarks
      await tx.marketBenchmark.updateMany({ where: { bandId: id }, data: { bandId: null } });
      return tx.band.delete({ where: { id } });
    });
    await cacheDelPattern('salary-bands:*');
    emitSalaryBandUpdated();
    return deleted;
  },

  // ─── Grade ────────────────────────────────────────────────────
  getGrades: async (bandId?: string) =>
    prisma.grade.findMany({
      where: bandId ? { bandId } : undefined,
      include: { band: true },
      orderBy: { gradeCode: 'asc' },
    }),

  createGrade: async (data: CreateGradeInput) => {
    const band = await prisma.band.findUnique({ where: { id: data.bandId } });
    if (!band) throw notFound('BAND_NOT_FOUND', 'Band not found');
    const existing = await prisma.grade.findFirst({
      where: {
        bandId: data.bandId,
        gradeCode: { equals: data.gradeCode, mode: 'insensitive' },
      },
    });
    if (existing) {
      throw conflict('GRADE_CODE_EXISTS', `Grade "${data.gradeCode}" already exists in this band`);
    }
    return prisma.grade.create({ data });
  },

  updateGrade: async (id: string, data: UpdateGradeInput) => {
    const grade = await prisma.grade.findUnique({ where: { id } });
    if (!grade) throw notFound('GRADE_NOT_FOUND', 'Grade not found');
    if (data.gradeCode && data.gradeCode !== grade.gradeCode) {
      const existing = await prisma.grade.findFirst({
        where: {
          bandId: grade.bandId,
          gradeCode: { equals: data.gradeCode, mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (existing) {
        throw conflict('GRADE_CODE_EXISTS', `Grade "${data.gradeCode}" already exists in this band`);
      }
    }
    return prisma.grade.update({ where: { id }, data });
  },

  deleteGrade: async (id: string) => {
    const grade = await prisma.grade.findUnique({ where: { id } });
    if (!grade) throw notFound('GRADE_NOT_FOUND', 'Grade not found');
    const jobCodeCount = await prisma.jobCode.count({ where: { gradeId: id } });
    if (jobCodeCount > 0) {
      throw conflict(
        'GRADE_IN_USE',
        `Cannot delete grade — ${jobCodeCount} job code(s) reference it`,
        { jobCodeCount },
      );
    }
    return prisma.grade.delete({ where: { id } });
  },

  // ─── JobCode ──────────────────────────────────────────────────
  getJobCodes: async (filters?: { bandId?: string; jobFamilyId?: string }) =>
    prisma.jobCode.findMany({
      where: {
        ...(filters?.bandId && { bandId: filters.bandId }),
        ...(filters?.jobFamilyId && { jobFamilyId: filters.jobFamilyId }),
      },
      include: { band: true, jobFamily: { include: { jobArea: true } }, grade: true },
      orderBy: { code: 'asc' },
    }),

  createJobCode: async (data: CreateJobCodeInput) => {
    const [family, band] = await Promise.all([
      prisma.jobFamily.findUnique({ where: { id: data.jobFamilyId } }),
      prisma.band.findUnique({ where: { id: data.bandId } }),
    ]);
    if (!family) throw notFound('FAMILY_NOT_FOUND', 'Job family not found');
    if (!band) throw notFound('BAND_NOT_FOUND', 'Band not found');

    const dup = await prisma.jobCode.findFirst({
      where: { code: { equals: data.code, mode: 'insensitive' } },
    });
    if (dup) {
      throw conflict('JOBCODE_CODE_EXISTS', `Job code "${data.code}" already exists`, { existingId: dup.id });
    }

    if (data.gradeId) {
      const grade = await prisma.grade.findUnique({ where: { id: data.gradeId } });
      if (!grade) throw notFound('GRADE_NOT_FOUND', 'Grade not found');
      if (grade.bandId !== data.bandId) {
        throw conflict(
          'GRADE_BAND_MISMATCH',
          'Selected grade belongs to a different band',
          { gradeBandId: grade.bandId, expectedBandId: data.bandId },
        );
      }
    }

    return prisma.jobCode.create({ data, include: { band: true, jobFamily: true, grade: true } });
  },

  updateJobCode: async (id: string, data: UpdateJobCodeInput) => {
    const existing = await prisma.jobCode.findUnique({ where: { id } });
    if (!existing) throw notFound('JOBCODE_NOT_FOUND', 'Job code not found');

    if (data.code && data.code !== existing.code) {
      const dup = await prisma.jobCode.findFirst({
        where: { code: { equals: data.code, mode: 'insensitive' }, NOT: { id } },
      });
      if (dup) throw conflict('JOBCODE_CODE_EXISTS', `Job code "${data.code}" already exists`);
    }

    // Determine effective bandId after this update
    const effectiveBandId = data.bandId ?? existing.bandId;

    if (data.bandId && data.bandId !== existing.bandId) {
      const band = await prisma.band.findUnique({ where: { id: data.bandId } });
      if (!band) throw notFound('BAND_NOT_FOUND', 'Band not found');
      const employeeCount = await prisma.employee.count({ where: { jobCodeId: id } });
      if (employeeCount > 0) {
        throw conflict(
          'JOBCODE_HAS_EMPLOYEES',
          `Cannot change band — ${employeeCount} employee(s) assigned to this job code. Reassign them first.`,
          { employeeCount },
        );
      }
    }

    // gradeId: undefined = preserve, null = clear, string = validate + set
    let gradeUpdate: { gradeId?: string | null } = {};
    if (data.gradeId === null) {
      gradeUpdate = { gradeId: null };
    } else if (typeof data.gradeId === 'string') {
      const grade = await prisma.grade.findUnique({ where: { id: data.gradeId } });
      if (!grade) throw notFound('GRADE_NOT_FOUND', 'Grade not found');
      if (grade.bandId !== effectiveBandId) {
        throw conflict(
          'GRADE_BAND_MISMATCH',
          'Selected grade belongs to a different band',
          { gradeBandId: grade.bandId, expectedBandId: effectiveBandId },
        );
      }
      gradeUpdate = { gradeId: data.gradeId };
    }
    // If undefined: omit gradeId entirely → preserve existing

    const { gradeId: _ignore, ...rest } = data;
    void _ignore;
    return prisma.jobCode.update({
      where: { id },
      data: { ...rest, ...gradeUpdate },
      include: { band: true, jobFamily: true, grade: true },
    });
  },

  deleteJobCode: async (id: string) => {
    const jc = await prisma.jobCode.findUnique({ where: { id } });
    if (!jc) throw notFound('JOBCODE_NOT_FOUND', 'Job code not found');
    const employeeCount = await prisma.employee.count({ where: { jobCodeId: id } });
    if (employeeCount > 0) {
      throw conflict(
        'JOBCODE_IN_USE',
        `Cannot delete job code "${jc.code}" — ${employeeCount} employee(s) still assigned`,
        { employeeCount },
      );
    }
    return prisma.jobCode.delete({ where: { id } });
  },

  // ─── Skills ───────────────────────────────────────────────────
  getSkills: async () => prisma.skill.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] }),

  createSkill: async (data: { name: string; category?: string; premiumMultiplier?: number }) =>
    prisma.skill.create({ data }),

  updateSkill: async (id: string, data: { name?: string; category?: string; premiumMultiplier?: number }) =>
    prisma.skill.update({ where: { id }, data }),
};

export { ServiceError };
