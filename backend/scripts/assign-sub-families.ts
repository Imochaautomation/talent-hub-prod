/**
 * assign-sub-families.ts
 *
 * Creates JobSubFamily records for each JobFamily and assigns existing JobCode
 * records to sub-families based on title keyword matching.
 *
 * Run: cd backend && npx ts-node scripts/assign-sub-families.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Sub-family definitions per family name.
// Each entry: { name, keywords } — keywords matched as case-insensitive substrings.
// The LAST entry in each array is the default (catches unmatched roles).
const SUBFAMILY_DEFINITIONS: Record<string, { name: string; keywords: string[] }[]> = {
  'Engineering': [
    { name: 'Quality Assurance',          keywords: ['QA', 'Quality'] },
    { name: 'DevOps & Infrastructure',    keywords: ['DevOps'] },
    { name: 'UI Development',             keywords: ['UI Developer', 'UI Dev'] },
    { name: 'Architecture & Leadership',  keywords: ['Architect', 'Project Manager'] },
    { name: 'Software Engineering',       keywords: [] }, // default
  ],
  'Product': [
    { name: 'UX Design',                  keywords: ['UX', 'Designer'] },
    { name: 'Technical Documentation',    keywords: ['Technical Writer', 'Documentation'] },
    { name: 'Product Management',         keywords: [] }, // default
  ],
  'Human Resources': [
    { name: 'Talent Acquisition',         keywords: ['Acquisition', 'Talent Acquisition'] },
    { name: 'HR Business Partnering',     keywords: ['Business Partner', 'Director'] },
    { name: 'HR Operations',              keywords: [] }, // default
  ],
  'Marketing': [
    { name: 'Marketing Leadership',       keywords: ['VP', 'Vice President', 'Chief Marketing'] },
    { name: 'Brand & Creative',           keywords: ['Graphic', 'Brand', 'Visual'] },
    { name: 'Digital Marketing',          keywords: ['SEO', 'Web Management', 'Automation'] },
    { name: 'Partnerships',               keywords: ['Partner'] },
    { name: 'Marketing Operations',       keywords: [] }, // default
  ],
  'Finance and Accounting': [
    { name: 'Financial Management',       keywords: ['Director', 'Manager', 'Lead', 'CFO'] },
    { name: 'Financial Analysis',         keywords: [] }, // default
  ],
  'Operations': [
    { name: 'Strategic Leadership',       keywords: ['CTO', 'Chief', 'Strategic', 'VP'] },
    { name: 'Operations & Procurement',   keywords: [] }, // default
  ],
  'Product Marketing': [
    { name: 'Product Marketing',          keywords: [] }, // default
  ],
  'Content': [
    { name: 'Editorial & Writing',        keywords: ['Editor', 'Technical Editor', 'Assistant Manager - Editing'] },
    { name: 'Skills & Products',          keywords: ['Skills', 'Product', 'Business Analyst', 'Head'] },
    { name: 'Community & Projects',       keywords: [] }, // default
  ],
  'Customer Success': [
    { name: 'Customer Support',           keywords: ['Support'] },
    { name: 'Customer Success Management', keywords: [] }, // default
  ],
  'Presales and Solutioning': [
    { name: 'Presales Consulting',        keywords: [] }, // default
  ],
  'Sales': [
    { name: 'Sales',                      keywords: [] }, // default
  ],
  'Channel Sales': [
    { name: 'Channel Management',         keywords: [] }, // default
  ],
  'Marketing (Business Development)': [
    { name: 'Business Development',       keywords: [] }, // default
  ],
};

function matchSubFamily(title: string, defs: { name: string; keywords: string[] }[]): string {
  const lTitle = title.toLowerCase();
  for (const def of defs) {
    if (def.keywords.length === 0) continue; // skip default sentinel — checked below
    for (const kw of def.keywords) {
      if (lTitle.includes(kw.toLowerCase())) {
        return def.name;
      }
    }
  }
  // Return the last entry (default)
  return defs[defs.length - 1].name;
}

async function main() {
  console.log('Starting sub-family assignment...\n');

  const families = await prisma.jobFamily.findMany({
    include: { jobCodes: true },
    orderBy: { name: 'asc' },
  });

  let totalSubFamiliesCreated = 0;
  let totalCodesAssigned = 0;
  let totalCodesSkipped = 0;

  for (const family of families) {
    const defs = SUBFAMILY_DEFINITIONS[family.name];

    if (!defs) {
      console.log(`[SKIP] No sub-family definition for family: "${family.name}" (${family.jobCodes.length} roles unassigned)`);
      totalCodesSkipped += family.jobCodes.length;
      continue;
    }

    console.log(`\nProcessing family: "${family.name}" (${family.jobCodes.length} roles)`);

    // Upsert all sub-families for this family
    const subFamilyMap: Record<string, string> = {}; // name → id
    for (const def of defs) {
      const sf = await prisma.jobSubFamily.upsert({
        where: { name_jobFamilyId: { name: def.name, jobFamilyId: family.id } },
        update: {},
        create: { name: def.name, jobFamilyId: family.id },
      });
      subFamilyMap[def.name] = sf.id;
      console.log(`  Sub-family: "${def.name}" (id: ${sf.id})`);
      totalSubFamiliesCreated++;
    }

    // Assign each job code to a sub-family
    for (const jc of family.jobCodes) {
      const sfName = matchSubFamily(jc.title, defs);
      const sfId = subFamilyMap[sfName];
      await prisma.jobCode.update({
        where: { id: jc.id },
        data: { jobSubFamilyId: sfId },
      });
      console.log(`  [${sfName}] ${jc.code}: ${jc.title}`);
      totalCodesAssigned++;
    }
  }

  console.log('\n─────────────────────────────────────────────');
  console.log(`Sub-families created/upserted: ${totalSubFamiliesCreated}`);
  console.log(`Job codes assigned:            ${totalCodesAssigned}`);
  console.log(`Job codes skipped (no def):    ${totalCodesSkipped}`);
  console.log('Done.\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
