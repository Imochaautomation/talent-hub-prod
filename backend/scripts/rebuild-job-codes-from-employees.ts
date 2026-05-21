/**
 * rebuild-job-codes-from-employees.ts
 *
 * Rebuilds job codes from actual employee data and links employees to them.
 * Groups employees by (department × designation × band) and creates one JobCode
 * per unique combination, then links every employee in that group to it.
 *
 * Safe to re-run — skips job codes that already exist (matched by code string).
 *
 * Run with: npx ts-node scripts/rebuild-job-codes-from-employees.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Department → target family name (must match exactly what's in DB) ─────────
const DEPT_TO_FAMILY: Record<string, string> = {
  // Technology Functions
  'Engineering':                    'Engineering',
  'Product':                        'Product',

  // Enabling Functions
  'Human Resources':                'Human Resources',
  'Marketing':                      'Marketing',
  'Finance':                        'Finance and Accounting',
  'Operations':                     'Operations',
  'Facilities':                     'Operations',
  'Product Marketing':              'Product Marketing',
  "Founder's Office":               'Operations',
  'Management':                     'Operations',

  // Customer Functions
  'Content':                        'Content',
  'Customer Success':               'Customer Success',
  'Pre-Sales and Solutioning':      'Presales and Solutioning',
  'Pre-Sales & Solutioning':        'Presales and Solutioning',
  'Sales':                          'Sales',
  'Channel Sales':                  'Channel Sales',
  'Marketing (Business Development)': 'Marketing (Business Development)',
};

// Short prefix per family name → used in job code generation
const FAMILY_PREFIX: Record<string, string> = {
  'Engineering':                      'ENG',
  'Product':                          'PRD',
  'Human Resources':                  'HR',
  'Marketing':                        'MKT',
  'Finance and Accounting':           'FIN',
  'Operations':                       'OPS',
  'Product Marketing':                'PMK',
  'Content':                          'CNT',
  'Customer Success':                 'CS',
  'Presales and Solutioning':         'PS',
  'Sales':                            'SAL',
  'Channel Sales':                    'CH',
  'Marketing (Business Development)': 'BD',
};

async function main() {
  console.log('🔧  Rebuilding job codes from employee data...\n');

  // ── Load bands ────────────────────────────────────────────────────────────
  const bands = await prisma.band.findMany();
  if (bands.length === 0) throw new Error('No bands found in DB');
  const bandByCode = new Map(bands.map(b => [b.code, b]));
  // Default fallback band (lowest level)
  const defaultBand = bands.sort((a, b) => a.level - b.level)[0];

  // ── Load grades ───────────────────────────────────────────────────────────
  const grades = await prisma.grade.findMany();
  const gradeByBandId = new Map(grades.map(g => [g.bandId, g]));

  // ── Load job families ─────────────────────────────────────────────────────
  const families = await prisma.jobFamily.findMany({ include: { jobArea: true } });
  const familyByName = new Map(families.map(f => [f.name, f]));

  // ── Load existing job codes (to avoid duplicates) ─────────────────────────
  const existingCodes = await prisma.jobCode.findMany({ select: { code: true, jobFamilyId: true, bandId: true, title: true } });
  const existingCodeSet = new Set(existingCodes.map(jc => jc.code));

  // Sequence counters per family prefix to generate unique codes
  const seqByPrefix = new Map<string, number>();
  for (const jc of existingCodes) {
    // Parse sequence from codes like MKT-P1-042
    const m = jc.code.match(/^([A-Z]+)-[A-Z0-9]+-(\d+)$/);
    if (m) {
      const prefix = m[1];
      const seq = parseInt(m[2], 10);
      seqByPrefix.set(prefix, Math.max(seqByPrefix.get(prefix) ?? 0, seq));
    }
  }

  function nextCode(prefix: string, bandCode: string): string {
    const seq = (seqByPrefix.get(prefix) ?? 0) + 1;
    seqByPrefix.set(prefix, seq);
    return `${prefix}-${bandCode}-${String(seq).padStart(3, '0')}`;
  }

  // ── Load all employees ────────────────────────────────────────────────────
  const employees = await prisma.employee.findMany({
    select: { id: true, department: true, designation: true, band: true, jobCodeId: true },
  });

  // ── Group employees by (department, designation, band) ───────────────────
  type GroupKey = string;
  const groups = new Map<GroupKey, { department: string; designation: string; band: string; empIds: string[] }>();

  for (const emp of employees) {
    const dept = emp.department?.trim() ?? '';
    const desig = emp.designation?.trim() ?? '';
    const bandCode = emp.band?.trim() ?? '';

    if (!dept || !desig) continue; // skip if no department or designation
    if (!DEPT_TO_FAMILY[dept]) {
      // silently skip unmapped departments (Facilities fallback already handled above)
      continue;
    }

    const key: GroupKey = `${dept}||${desig}||${bandCode}`;
    if (!groups.has(key)) groups.set(key, { department: dept, designation: desig, band: bandCode, empIds: [] });
    groups.get(key)!.empIds.push(emp.id);
  }

  console.log(`  Found ${groups.size} unique (dept × designation × band) combinations across ${employees.length} employees\n`);

  // ── Process each group ────────────────────────────────────────────────────
  let created = 0;
  let skipped = 0;
  let linked = 0;

  for (const [, group] of groups) {
    const familyName = DEPT_TO_FAMILY[group.department];
    if (!familyName) continue;

    const family = familyByName.get(familyName);
    if (!family) {
      console.warn(`  ⚠  Family "${familyName}" not found in DB — skipping "${group.department}"`);
      continue;
    }

    const prefix = FAMILY_PREFIX[familyName] ?? familyName.substring(0, 3).toUpperCase();
    const bandCode = group.band || defaultBand.code;
    const band = bandByCode.get(bandCode) ?? defaultBand;
    const grade = gradeByBandId.get(band.id);

    // Check if a matching job code already exists in this family for this title+band
    const existingMatch = existingCodes.find(
      jc => jc.jobFamilyId === family.id && jc.bandId === band.id && jc.title === group.designation
    );

    let jobCodeId: string;

    if (existingMatch) {
      jobCodeId = (await prisma.jobCode.findFirst({ where: { code: existingMatch.code } }))!.id;
      skipped++;
    } else {
      // Generate a unique code
      let code = nextCode(prefix, band.code);
      while (existingCodeSet.has(code)) code = nextCode(prefix, band.code);
      existingCodeSet.add(code);

      const jc = await prisma.jobCode.create({
        data: {
          code,
          title: group.designation,
          jobFamilyId: family.id,
          bandId: band.id,
          gradeId: grade?.id ?? undefined,
        },
      });
      jobCodeId = jc.id;
      existingCodes.push({ code, jobFamilyId: family.id, bandId: band.id, title: group.designation });
      created++;
    }

    // Link employees that don't already have a job code
    for (const empId of group.empIds) {
      const emp = employees.find(e => e.id === empId);
      if (emp && emp.jobCodeId !== jobCodeId) {
        await prisma.employee.update({ where: { id: empId }, data: { jobCodeId } });
        linked++;
      }
    }
  }

  console.log(`  ✓ Job codes created : ${created}`);
  console.log(`  · Job codes reused  : ${skipped}`);
  console.log(`  ✓ Employees linked  : ${linked}\n`);

  // ── Final summary ─────────────────────────────────────────────────────────
  const finalFamilies = await prisma.jobFamily.findMany({
    include: { jobArea: true, _count: { select: { jobCodes: true } } },
    orderBy: [{ jobArea: { name: 'asc' } }, { name: 'asc' }],
  });

  console.log('✅  Final job family role counts:\n');
  let lastArea = '';
  for (const f of finalFamilies) {
    if (f.jobArea.name !== lastArea) {
      console.log(`  ${f.jobArea.name}`);
      lastArea = f.jobArea.name;
    }
    console.log(`    · ${f.name.padEnd(28)} ${f._count.jobCodes} role(s)`);
  }
  console.log();
}

main()
  .catch(e => { console.error('❌  Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
