/**
 * restructure-to-three-areas.ts
 *
 * Transforms the job architecture from the old 6-area seed structure to the
 * correct 3-area structure:
 *   E – Enabling Functions  (E-HR, E-MA, E-FA, E-PM, E-OP)
 *   C – Customer Functions  (C-PS, C-CS, C-CN, C-SL)
 *   T – Technology Functions (T-EN, T-PR)
 *
 * Steps:
 *   1. Upsert the 3 correct Job Areas and 13 Job Families
 *   2. Remap existing JobCodes from old families to the matching new family
 *   3. Delete old Job Areas that no longer belong (cascades their orphaned families)
 *
 * Run with: npx ts-node scripts/restructure-to-three-areas.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Target structure ──────────────────────────────────────────────────────────

const TARGET = [
  {
    name: 'Enabling Functions',
    description: 'E – Internal support functions that enable the business to operate efficiently',
    families: [
      { code: 'E-HR', name: 'Human Resources' },
      { code: 'E-MA', name: 'Marketing' },
      { code: 'E-FA', name: 'Finance and Accounting' },
      { code: 'E-PM', name: 'Product Marketing' },
      { code: 'E-OP', name: 'Operations' },
    ],
  },
  {
    name: 'Customer Functions',
    description: 'C – Functions that directly interact with and serve customers',
    families: [
      { code: 'C-PS', name: 'Presales and Solutioning' },
      { code: 'C-CS', name: 'Customer Success' },
      { code: 'C-CN', name: 'Content' },
      { code: 'C-SL', name: 'Sales' },
    ],
  },
  {
    name: 'Technology Functions',
    description: 'T – Functions responsible for building and managing the product and platform',
    families: [
      { code: 'T-EN', name: 'Engineering' },
      { code: 'T-PR', name: 'Product' },
    ],
  },
];

// Maps old Job Area name → new family code that should absorb its job codes.
// Old families within those areas all collapse into the single mapped new family.
const OLD_AREA_TO_NEW_FAMILY: Record<string, string> = {
  'Engineering': 'T-EN',
  'Finance':     'E-FA',
  'HR':          'E-HR',
  'Marketing':   'E-MA',
  'Operations':  'E-OP',
  'Sales':       'C-SL',
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🏗️  Restructuring Job Architecture to 3-area model...\n');

  // ── Step 1: Upsert 3 Job Areas + 13 Job Families ─────────────────────────

  // familyCodeToId: code like "E-HR" → new family DB id
  const familyCodeToId = new Map<string, string>();

  for (const area of TARGET) {
    const existing = await prisma.jobArea.findFirst({
      where: { name: { equals: area.name, mode: 'insensitive' } },
    });
    const jobArea = existing
      ? await prisma.jobArea.update({ where: { id: existing.id }, data: { description: area.description } })
      : await prisma.jobArea.create({ data: { name: area.name, description: area.description } });

    console.log(`  ${existing ? '↺' : '+'} Job Area: ${jobArea.name}`);

    for (const fam of area.families) {
      const existingFam = await prisma.jobFamily.findFirst({
        where: { jobAreaId: jobArea.id, name: { equals: fam.name, mode: 'insensitive' } },
      });
      const jobFamily = existingFam
        ? existingFam
        : await prisma.jobFamily.create({ data: { name: fam.name, jobAreaId: jobArea.id } });

      familyCodeToId.set(fam.code, jobFamily.id);
      console.log(`    ${existingFam ? '·' : '+'} ${fam.code} :: ${fam.name}`);
    }
  }
  console.log();

  // ── Step 2: Identify old Job Areas (those not in TARGET) ─────────────────

  const targetAreaNames = new Set(TARGET.map(a => a.name.toLowerCase()));
  const allAreas = await prisma.jobArea.findMany({ include: { jobFamilies: { include: { jobCodes: true } } } });
  const oldAreas = allAreas.filter(a => !targetAreaNames.has(a.name.toLowerCase()));

  if (oldAreas.length === 0) {
    console.log('  ✓ No old areas to migrate — structure is already correct.\n');
  } else {
    console.log(`  Found ${oldAreas.length} old area(s) to migrate: ${oldAreas.map(a => a.name).join(', ')}\n`);

    // ── Step 3: Remap job codes from old families → correct new family ──────

    for (const oldArea of oldAreas) {
      const newFamilyCode = OLD_AREA_TO_NEW_FAMILY[oldArea.name];
      if (!newFamilyCode) {
        console.warn(`  ⚠  No mapping defined for old area "${oldArea.name}" — skipping its job codes`);
        continue;
      }
      const newFamilyId = familyCodeToId.get(newFamilyCode);
      if (!newFamilyId) {
        console.warn(`  ⚠  New family ${newFamilyCode} not found — skipping`);
        continue;
      }

      let movedCount = 0;
      for (const fam of oldArea.jobFamilies) {
        for (const jc of fam.jobCodes) {
          await prisma.jobCode.update({ where: { id: jc.id }, data: { jobFamilyId: newFamilyId } });
          movedCount++;
        }
      }
      console.log(`  ↳ Moved ${movedCount} job code(s) from "${oldArea.name}" → ${newFamilyCode}`);
    }
    console.log();

    // ── Step 4: Delete old areas (cascades their now-empty families) ─────────

    for (const oldArea of oldAreas) {
      await prisma.jobArea.delete({ where: { id: oldArea.id } });
      console.log(`  🗑  Deleted old area: ${oldArea.name}`);
    }
    console.log();
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const finalAreas = await prisma.jobArea.findMany({
    include: { jobFamilies: { include: { _count: { select: { jobCodes: true } } } } },
  });

  console.log('✅  Final structure:\n');
  for (const area of finalAreas) {
    const totalRoles = area.jobFamilies.reduce((s, f) => s + f._count.jobCodes, 0);
    console.log(`  ${area.name}  (${area.jobFamilies.length} families, ${totalRoles} roles)`);
    for (const fam of area.jobFamilies) {
      console.log(`    · ${fam.name}  — ${fam._count.jobCodes} role(s)`);
    }
  }
  console.log();
}

main()
  .catch(e => { console.error('❌  Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
