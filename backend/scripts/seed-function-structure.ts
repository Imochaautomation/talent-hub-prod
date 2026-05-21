import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STRUCTURE = [
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

async function main() {
  console.log('Creating Job Architecture structure...\n');

  for (const area of STRUCTURE) {
    // Upsert Job Area by name
    const existing = await prisma.jobArea.findFirst({
      where: { name: { equals: area.name, mode: 'insensitive' } },
    });

    const jobArea = existing
      ? await prisma.jobArea.update({ where: { id: existing.id }, data: { description: area.description } })
      : await prisma.jobArea.create({ data: { name: area.name, description: area.description } });

    const action = existing ? 'updated' : 'created';
    console.log(`✓ ${action} Job Area: ${jobArea.name} (${jobArea.id})`);

    for (const fam of area.families) {
      const existingFam = await prisma.jobFamily.findFirst({
        where: {
          jobAreaId: jobArea.id,
          name: { equals: fam.name, mode: 'insensitive' },
        },
      });

      if (existingFam) {
        console.log(`  · already exists: ${fam.code} :: ${fam.name}`);
      } else {
        await prisma.jobFamily.create({
          data: { name: fam.name, jobAreaId: jobArea.id },
        });
        console.log(`  + created: ${fam.code} :: ${fam.name}`);
      }
    }
    console.log();
  }

  console.log('Done.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
