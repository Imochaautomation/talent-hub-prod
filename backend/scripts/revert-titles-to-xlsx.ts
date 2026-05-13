/**
 * revert-titles-to-xlsx.ts
 *
 * Restores JobCode.title to the verbatim text from the master xlsx.
 * Use this when HR is the source of truth and should own corrections via the UI.
 *
 * Run:
 *   cd backend && npx ts-node -r dotenv/config scripts/revert-titles-to-xlsx.ts
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const XLSX_PATH = '/Users/bakulbrindachakravarty/Desktop/Comp-sense/Master- Job architecture.xlsx';

// Map DB family name to xlsx column header.
// `family + '__' + area` keys handle the two families both literally named
// "Product Management" (one in Content area as "Product Mgt", one in Product area as "Product").
const FAMILY_REMAP: Record<string, string> = {
  'Presales and Solutioning':         'Presales and Solutioning',
  'Data Analytics':                   'Data Analytics',
  'Development':                      'Development',
  'DevOps':                           'DevOps',
  'Product Support':                  'Product Support',
  'Testing':                          'Testing',
  'UI Engineering':                   'UI',
  'Talent Acquisition':               'TA',
  'Talent Management':                'TM',
  'HR Operations':                    'HR Ops',
  'Training and Development':         'TD',
  'Community':                        'Community',
  'Editing and Proofreading':         'Editing and Proof reading',
  'Product Management__Content':      'Product Mgt',
  'Project Management':               'Project Mgt',
  'Coding and Projects':              'Coding',
  'Skills Consulting':                'Skills Consulting',
  'Product Marketing':                'Product Marketing',
  'Research':                         'Research',
  'Design':                           'Designing',
  'Customer Success - Vertical 1':    'Vertical 1',
  'Customer Success - Vertical 2':    'Vertical 2',
  'Customer Support - Vertical 3':    'Vertical 3',
  'Product Management__Product':      'Product',
  'UX Design':                        'Design',
  'Finance':                          'Role',
  'Sales':                            'Role',
  'Channel Sales':                    'Role',
};

function readXlsxMap(): Record<string, Record<string, string>> {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets['Mastersheet - Level'];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: '' });
  const areaRow = rows[0];
  const famRow  = rows[1];

  // Forward-fill area row (merged cells appear as empty)
  let lastArea = '';
  const areaCol: string[] = [];
  for (let c = 0; c < areaRow.length; c++) {
    const v = String(areaRow[c]).trim();
    if (v) lastArea = v;
    areaCol.push(c >= 2 ? lastArea : '');
  }

  const map: Record<string, Record<string, string>> = {};
  for (let r = 2; r < rows.length; r++) {
    const level = String(rows[r][1]).trim();
    if (!level) continue;
    for (let c = 2; c < famRow.length; c++) {
      const family = String(famRow[c]).trim();
      const area = areaCol[c];
      const role = String(rows[r][c]).trim();
      if (!family || !role || role === 'NA') continue;
      const k = area + '||' + family;
      map[k] = map[k] || {};
      map[k][level] = role;
    }
  }
  return map;
}

const prisma = new PrismaClient();

async function main() {
  console.log('🔄  Reverting JobCode titles to verbatim xlsx text…\n');

  const xlsxMap = readXlsxMap();

  const areas = await prisma.jobArea.findMany({
    include: { jobFamilies: { include: { jobCodes: { include: { band: true } } } } },
  });

  let updated = 0;
  const reverted: { area: string; family: string; band: string; from: string; to: string }[] = [];

  for (const a of areas) {
    for (const f of a.jobFamilies) {
      const remapKey = FAMILY_REMAP[f.name + '__' + a.name] ?? FAMILY_REMAP[f.name];
      if (!remapKey) {
        console.log(`   ⚠  No xlsx mapping for ${a.name} / ${f.name} — skipping`);
        continue;
      }
      const xlsxKey = a.name + '||' + remapKey;
      const xlsxRoles = xlsxMap[xlsxKey];
      if (!xlsxRoles) {
        console.log(`   ⚠  No xlsx roles for ${xlsxKey}`);
        continue;
      }

      for (const jc of f.jobCodes) {
        const xlsxTitle = xlsxRoles[jc.band.code];
        if (!xlsxTitle) continue;
        if (xlsxTitle !== jc.title) {
          reverted.push({ area: a.name, family: f.name, band: jc.band.code, from: jc.title, to: xlsxTitle });
          await prisma.jobCode.update({ where: { id: jc.id }, data: { title: xlsxTitle } });
          updated++;
        }
      }
    }
  }

  console.log(`\n✅  Updated ${updated} JobCode titles to match xlsx verbatim`);
  console.log('\n— Changes applied —');
  for (const r of reverted) {
    console.log(`  [${r.area} / ${r.family} / ${r.band}]`);
    console.log(`     was: ${r.from}`);
    console.log(`     now: ${r.to}`);
  }
}

main()
  .catch(e => { console.error('❌ ', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
