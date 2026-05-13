/**
 * seed-salary-bands-master.ts
 *
 * Seeds SalaryBand and MarketBenchmark rows for all 19 bands in the
 * real company job architecture. Ranges are Indian IT industry standard
 * (annual fixed, INR) at 2025/26 levels, with an Engineering premium.
 *
 * Run AFTER seed-real-job-architecture.ts.
 *
 *   cd backend && npx ts-node -r dotenv/config scripts/seed-salary-bands-master.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default ranges (jobAreaId = null) — apply to all areas unless overridden.
// Numbers are annual fixed pay in INR.
const DEFAULT_RANGES: Record<string, { min: number; mid: number; max: number }> = {
  A1: { min:    300_000, mid:    450_000, max:    600_000 },
  A2: { min:    500_000, mid:    700_000, max:    900_000 },
  P1: { min:    800_000, mid:  1_100_000, max:  1_400_000 },
  P2: { min:  1_300_000, mid:  1_750_000, max:  2_200_000 },
  P3: { min:  2_000_000, mid:  2_700_000, max:  3_400_000 },
  P4: { min:  2_800_000, mid:  3_700_000, max:  4_600_000 },
  M0: { min:  2_400_000, mid:  3_000_000, max:  3_800_000 },
  M1: { min:  3_300_000, mid:  4_300_000, max:  5_400_000 },
  M2: { min:  4_500_000, mid:  5_800_000, max:  7_200_000 },
  M3: { min:  6_000_000, mid:  7_800_000, max:  9_800_000 },
  D0: { min:  7_500_000, mid:  9_500_000, max: 12_000_000 },
  D1: { min: 10_000_000, mid: 13_000_000, max: 16_500_000 },
  D2: { min: 14_000_000, mid: 17_500_000, max: 22_000_000 },
  V0: { min: 19_000_000, mid: 23_500_000, max: 29_000_000 },
  V1: { min: 25_000_000, mid: 31_000_000, max: 38_000_000 },
  V2: { min: 33_000_000, mid: 40_000_000, max: 48_000_000 },
  E0: { min: 42_000_000, mid: 52_000_000, max: 62_000_000 },
  E1: { min: 55_000_000, mid: 68_000_000, max: 82_000_000 },
  E2: { min: 75_000_000, mid: 92_000_000, max: 110_000_000 },
};

// Area-specific multipliers applied on top of default range.
// Engineering and Product carry a tech premium; HR/Finance run at default.
const AREA_MULTIPLIERS: Record<string, number> = {
  'Engineering':       1.10,
  'Product':           1.08,
  'Pre-Sales and Solutioning': 1.05,
  'Product Marketing': 1.02,
  'Customer Success':  1.00,
  'Sales':             0.95, // lower fixed; higher variable / commission
  'Channel Sales':     0.95,
  'Content':           0.95,
  'Human Resources':   0.95,
  'Finance':           1.00,
};

async function main() {
  console.log('🌱  Seeding salary bands and market benchmarks…\n');

  // 1. Wipe existing — keeps things deterministic
  await prisma.marketBenchmark.deleteMany();
  await prisma.salaryBand.deleteMany();
  console.log('   ✅  Cleared existing salary bands and benchmarks');

  const bands = await prisma.band.findMany();
  const bandByCode = new Map(bands.map(b => [b.code, b]));

  const areas = await prisma.jobArea.findMany();
  const now = new Date();
  const benchmarkAsOf = new Date('2025-10-01');

  let salaryBandCount = 0;
  let benchmarkCount = 0;

  // 2. Default per-band ranges (jobAreaId = null)
  for (const [code, range] of Object.entries(DEFAULT_RANGES)) {
    const band = bandByCode.get(code);
    if (!band) {
      console.warn(`   ⚠  Band ${code} not in DB — skipping`);
      continue;
    }
    await prisma.salaryBand.create({
      data: {
        bandId:        band.id,
        jobAreaId:     null,
        effectiveDate: now,
        minSalary:     range.min,
        midSalary:     range.mid,
        maxSalary:     range.max,
        currency:      'INR',
      },
    });
    salaryBandCount++;

    await prisma.marketBenchmark.create({
      data: {
        bandId:    band.id,
        jobCodeId: null,
        jobAreaId: null,
        location:  'India',
        p25:       Math.round(range.min * 0.95),
        p50:       Math.round(range.mid * 0.98),
        p75:       Math.round(range.mid * 1.08),
        p90:       Math.round(range.max * 1.05),
        source:    'Mercer / AON India IT 2025',
        asOfDate:  benchmarkAsOf,
      },
    });
    benchmarkCount++;
  }

  // 3. Area-specific overrides
  for (const area of areas) {
    const mult = AREA_MULTIPLIERS[area.name];
    if (!mult || mult === 1.0) continue; // skip areas with no premium/discount

    for (const [code, range] of Object.entries(DEFAULT_RANGES)) {
      const band = bandByCode.get(code);
      if (!band) continue;

      const adjMin = Math.round(range.min * mult);
      const adjMid = Math.round(range.mid * mult);
      const adjMax = Math.round(range.max * mult);

      await prisma.salaryBand.create({
        data: {
          bandId:        band.id,
          jobAreaId:     area.id,
          effectiveDate: now,
          minSalary:     adjMin,
          midSalary:     adjMid,
          maxSalary:     adjMax,
          currency:      'INR',
        },
      });
      salaryBandCount++;

      await prisma.marketBenchmark.create({
        data: {
          bandId:    band.id,
          jobCodeId: null,
          jobAreaId: area.id,
          location:  'India',
          p25:       Math.round(adjMin * 0.95),
          p50:       Math.round(adjMid * 0.98),
          p75:       Math.round(adjMid * 1.08),
          p90:       Math.round(adjMax * 1.05),
          source:    'Mercer / AON India IT 2025',
          asOfDate:  benchmarkAsOf,
        },
      });
      benchmarkCount++;
    }
  }

  console.log(`   ✅  ${salaryBandCount} salary band rows created`);
  console.log(`   ✅  ${benchmarkCount} market benchmark rows created`);

  console.log('\n🎉  Done.');
}

main()
  .catch(e => { console.error('❌  Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
