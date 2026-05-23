/**
 * assign-sub-families.ts  (v2 — code-prefix-first matching)
 *
 * Derives sub-families from the original family structure that is encoded
 * in each job code's prefix segments:
 *
 *   E-MA-CM-A1  → Marketing / Content Marketing
 *   ENG-TEST-P1 → Engineering / Quality Assurance
 *
 * Strategy per family:
 *   1. Code prefix  (most reliable — encodes original family)
 *   2. Specific code lookup
 *   3. Title keyword fallback
 *   4. Default catch-all
 *
 * Safe to re-run — clears and rebuilds all sub-family assignments.
 *
 * Run:  cd backend && npx ts-node scripts/assign-sub-families.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Sub-family matcher per family name ────────────────────────────────────────

type Matcher = (code: string, title: string) => string;

// Marketing (E-MA) — 16 sub-families derived from the 3rd code segment
const MARKETING_MATCHER: Matcher = (code, title) => {
  const segs = code.split('-');

  // E-MA-XX-* → look up 3-segment prefix
  if (segs[0] === 'E' && segs[1] === 'MA' && segs[2]) {
    const p3map: Record<string, string> = {
      BM: 'Brand Marketing',
      CM: 'Content Marketing',
      DD: 'Demand Generation',
      DG: 'Design & Creative',
      DR: 'Design & Creative',
      DM: 'Digital Marketing',
      EV: 'Events & Field Marketing',
      AR: 'Analyst Relations',
      PP: 'Partnerships',
      MO: 'Marketing Automation & Ops',
      PM: 'Program Management',
    };
    if (p3map[segs[2]]) return p3map[segs[2]];
  }

  // PM-MKT / PM-RES
  if (segs[0] === 'PM' && segs[1] === 'MKT') return 'Program Management';
  if (segs[0] === 'PM' && segs[1] === 'RES') return 'Research & Insights';

  // Specific code → sub-family
  const specific: Record<string, string> = {
    // Brand / Design
    'SGD-P1':    'Brand Marketing',
    'CD-D1':     'Design & Creative',
    // Demand Generation
    'D-DG-D1':   'Demand Generation',
    // Research
    'SRA-P1':    'Research & Insights',
    'LRAS-P2':   'Research & Insights',
    'D-R-D1':    'Research & Insights',
    // Program Management
    'D-P-D1':    'Program Management',
    // SEO & SEM
    'ASE-A1':    'SEO & SEM',
    'ASM-M0':    'SEO & SEM',
    'SSL-P3':    'SEO & SEM',
    'SSM-M1':    'SEO & SEM',
    'SE-A2':     'SEO & SEM',
    'SS-P1':     'SEO & SEM',
    'SSS-M2':    'SEO & SEM',
    'SSS-P2':    'SEO & SEM',
    'AD-S-D0':   'SEO & SEM',
    'D-S-D1':    'SEO & SEM',
    // Web & Growth
    'WGL-P3':    'Web & Growth',
    'WE-A2':     'Web & Growth',
    'AWE-A1':    'Web & Growth',
    'AWM-M0':    'Web & Growth',
    'WMG-M1':    'Web & Growth',
    'WMS-P1':    'Web & Growth',
    'SWM-M2':    'Web & Growth',
    'SWMS-P2':   'Web & Growth',
    'AD-W-D0':   'Web & Growth',
    'D-W-D1':    'Web & Growth',
    // Video Production
    'VE-A2':     'Video Production',
    'VPM-M1':    'Video Production',
    'VPS-P3':    'Video Production',
    'LVE-P2':    'Video Production',
    'SVE-P1':    'Video Production',
    'SVPM-M2':   'Video Production',
    'AVE-A1':    'Video Production',
    'AVPM-M0':   'Video Production',
    'H-V-D1':    'Video Production',
    // Marketing Leadership
    'AVP--V0':   'Marketing Leadership',
    'SVP--V2':   'Marketing Leadership',
    'VP-M-V1':   'Marketing Leadership',
    // Others
    'MKT-M1-005': 'Partnerships',
    'MKT-A1-001': 'Content Marketing',
    'MKT-A2-004': 'SEO & SEM',
  };
  if (specific[code]) return specific[code];

  // Title keyword fallback
  const t = title.toLowerCase();
  if (t.includes('vp ') || t.includes('vice president') || t.includes('chief marketing')) return 'Marketing Leadership';
  if (t.includes('seo') || t.includes('sem') || t.includes('search engine')) return 'SEO & SEM';
  if (t.includes('web ') || t.includes('web &') || t.includes('web management') || t.includes('web growth')) return 'Web & Growth';
  if (t.includes('video') || t.includes('production editor')) return 'Video Production';
  if (t.includes('content marketing') || t.includes('content writer')) return 'Content Marketing';
  if (t.includes('brand')) return 'Brand Marketing';
  if (t.includes('demand generation')) return 'Demand Generation';
  if (t.includes('event')) return 'Events & Field Marketing';
  if (t.includes('analyst relation')) return 'Analyst Relations';
  if (t.includes('partner')) return 'Partnerships';
  if (t.includes('automation') || t.includes('marketing ops')) return 'Marketing Automation & Ops';
  if (t.includes('graphic') || t.includes('design') || t.includes('creative director')) return 'Design & Creative';
  if (t.includes('digital marketing')) return 'Digital Marketing';
  if (t.includes('research')) return 'Research & Insights';

  return 'Marketing Operations'; // catch-all
};

// Engineering (T-EN) — 7 sub-families derived from the 2nd code segment
const ENGINEERING_MATCHER: Matcher = (code, title) => {
  const segs = code.split('-');
  const t = title.toLowerCase();

  if (segs[0] === 'ENG' && segs[1]) {
    const seg2 = segs[1];
    if (seg2 === 'TEST') return 'Quality Assurance';
    if (seg2 === 'OPS')  return 'DevOps & Infrastructure';
    if (seg2 === 'UI')   return 'UI Development';
    if (seg2 === 'DA')   return 'Data Analytics';
    if (seg2 === 'PS')   return 'Product Support';
    if (seg2 === 'DEV') {
      if (t.includes('project manager') || t.includes('director') || t.includes('architect')) return 'Engineering Leadership';
      return 'Software Development';
    }
    // ENG-A1-*, ENG-P2-*, ENG-M1-* (original seed codes)
    if (t.includes('architect')) return 'Engineering Leadership';
    if (t.includes('qa') || t.includes('quality') || t.includes('test')) return 'Quality Assurance';
    if (t.includes('project manager')) return 'Engineering Leadership';
  }

  // Non-ENG prefixed codes in this family
  if (t.includes('technical lead') || t.includes('technical specialist') || t.includes('technical expert')) return 'Software Development';
  if (code.startsWith('TL-') || code.startsWith('TS-')) return 'Software Development';

  return 'Software Development'; // default
};

// ─── Full definitions for all 13 families ─────────────────────────────────────

interface SubFamilyDef {
  name: string;
  matcher: Matcher;
}

const FAMILY_MATCHERS: Record<string, SubFamilyDef[]> = {

  // ── Technology Functions ───────────────────────────────────────────────────
  'Engineering': [
    { name: 'Software Development',       matcher: ENGINEERING_MATCHER },
    { name: 'Quality Assurance',          matcher: ENGINEERING_MATCHER },
    { name: 'DevOps & Infrastructure',    matcher: ENGINEERING_MATCHER },
    { name: 'UI Development',             matcher: ENGINEERING_MATCHER },
    { name: 'Data Analytics',             matcher: ENGINEERING_MATCHER },
    { name: 'Product Support',            matcher: ENGINEERING_MATCHER },
    { name: 'Engineering Leadership',     matcher: ENGINEERING_MATCHER },
  ],
  'Product': [
    {
      name: 'UX Design',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('ux') || tl.includes('designer')) return 'UX Design';
        if (tl.includes('technical writer') || tl.includes('documentation')) return 'Technical Documentation';
        return 'Product Management';
      },
    },
    {
      name: 'Technical Documentation',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('ux') || tl.includes('designer')) return 'UX Design';
        if (tl.includes('technical writer') || tl.includes('documentation')) return 'Technical Documentation';
        return 'Product Management';
      },
    },
    {
      name: 'Product Management',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('ux') || tl.includes('designer')) return 'UX Design';
        if (tl.includes('technical writer') || tl.includes('documentation')) return 'Technical Documentation';
        return 'Product Management';
      },
    },
  ],

  // ── Enabling Functions ─────────────────────────────────────────────────────
  'Human Resources': [
    {
      name: 'Talent Acquisition',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('acquisition') || tl.includes('recrui')) return 'Talent Acquisition';
        if (tl.includes('business partner') || tl.includes('director') || tl.includes('head')) return 'HR Business Partnering';
        return 'HR Operations';
      },
    },
    {
      name: 'HR Business Partnering',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('acquisition') || tl.includes('recrui')) return 'Talent Acquisition';
        if (tl.includes('business partner') || tl.includes('director') || tl.includes('head')) return 'HR Business Partnering';
        return 'HR Operations';
      },
    },
    {
      name: 'HR Operations',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('acquisition') || tl.includes('recrui')) return 'Talent Acquisition';
        if (tl.includes('business partner') || tl.includes('director') || tl.includes('head')) return 'HR Business Partnering';
        return 'HR Operations';
      },
    },
  ],
  'Marketing': [
    { name: 'Brand Marketing',           matcher: MARKETING_MATCHER },
    { name: 'Content Marketing',         matcher: MARKETING_MATCHER },
    { name: 'Demand Generation',         matcher: MARKETING_MATCHER },
    { name: 'Design & Creative',         matcher: MARKETING_MATCHER },
    { name: 'Digital Marketing',         matcher: MARKETING_MATCHER },
    { name: 'Events & Field Marketing',  matcher: MARKETING_MATCHER },
    { name: 'Analyst Relations',         matcher: MARKETING_MATCHER },
    { name: 'Partnerships',              matcher: MARKETING_MATCHER },
    { name: 'Marketing Automation & Ops', matcher: MARKETING_MATCHER },
    { name: 'Program Management',        matcher: MARKETING_MATCHER },
    { name: 'Research & Insights',       matcher: MARKETING_MATCHER },
    { name: 'SEO & SEM',                 matcher: MARKETING_MATCHER },
    { name: 'Video Production',          matcher: MARKETING_MATCHER },
    { name: 'Web & Growth',              matcher: MARKETING_MATCHER },
    { name: 'Marketing Leadership',      matcher: MARKETING_MATCHER },
    { name: 'Marketing Operations',      matcher: MARKETING_MATCHER },
  ],
  'Finance and Accounting': [
    {
      name: 'Financial Management',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('director') || tl.includes('manager') || tl.includes(' lead') ||
            tl.includes('cfo') || tl.includes('vice president') || tl.includes('vp ')) return 'Financial Management';
        return 'Financial Analysis';
      },
    },
    {
      name: 'Financial Analysis',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('director') || tl.includes('manager') || tl.includes(' lead') ||
            tl.includes('cfo') || tl.includes('vice president') || tl.includes('vp ')) return 'Financial Management';
        return 'Financial Analysis';
      },
    },
  ],
  'Operations': [
    {
      name: 'Strategic Leadership',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('cto') || tl.includes('chief') || tl.includes('strategic') || tl.includes('vp ')) return 'Strategic Leadership';
        return 'Operations & Procurement';
      },
    },
    {
      name: 'Operations & Procurement',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('cto') || tl.includes('chief') || tl.includes('strategic') || tl.includes('vp ')) return 'Strategic Leadership';
        return 'Operations & Procurement';
      },
    },
  ],
  'Product Marketing': [
    { name: 'Product Marketing', matcher: () => 'Product Marketing' },
  ],

  // ── Customer Functions ─────────────────────────────────────────────────────
  'Presales and Solutioning': [
    { name: 'Presales Consulting', matcher: () => 'Presales Consulting' },
  ],
  'Customer Success': [
    {
      name: 'Customer Support',
      matcher: (_, t) => {
        if (t.toLowerCase().includes('support')) return 'Customer Support';
        return 'Customer Success Management';
      },
    },
    {
      name: 'Customer Success Management',
      matcher: (_, t) => {
        if (t.toLowerCase().includes('support')) return 'Customer Support';
        return 'Customer Success Management';
      },
    },
  ],
  'Content': [
    {
      name: 'Editorial & Writing',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('editor') || tl.includes('editing') || tl.includes('content editor') || tl.includes('technical editor')) return 'Editorial & Writing';
        if (tl.includes('skill') || tl.includes('product') || tl.includes('business analyst') || tl.includes('head')) return 'Skills & Products';
        return 'Community & Projects';
      },
    },
    {
      name: 'Skills & Products',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('editor') || tl.includes('editing') || tl.includes('content editor') || tl.includes('technical editor')) return 'Editorial & Writing';
        if (tl.includes('skill') || tl.includes('product') || tl.includes('business analyst') || tl.includes('head')) return 'Skills & Products';
        return 'Community & Projects';
      },
    },
    {
      name: 'Community & Projects',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('editor') || tl.includes('editing') || tl.includes('content editor') || tl.includes('technical editor')) return 'Editorial & Writing';
        if (tl.includes('skill') || tl.includes('product') || tl.includes('business analyst') || tl.includes('head')) return 'Skills & Products';
        return 'Community & Projects';
      },
    },
  ],
  'Sales': [
    {
      name: 'Account Management',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('account executive') || tl.includes('account manager') || tl.includes('partner manager')) return 'Account Management';
        return 'Sales Leadership';
      },
    },
    {
      name: 'Sales Leadership',
      matcher: (_, t) => {
        const tl = t.toLowerCase();
        if (tl.includes('account executive') || tl.includes('account manager') || tl.includes('partner manager')) return 'Account Management';
        return 'Sales Leadership';
      },
    },
  ],
  'Channel Sales': [
    { name: 'Channel Management', matcher: () => 'Channel Management' },
  ],
  'Marketing (Business Development)': [
    { name: 'Business Development', matcher: () => 'Business Development' },
  ],
};

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄  Rebuilding sub-family assignments (v2 — code-prefix strategy)…\n');

  // Step 1: unset all existing jobSubFamilyId assignments
  const unsetResult = await prisma.jobCode.updateMany({ data: { jobSubFamilyId: null } });
  console.log(`  ↺  Cleared ${unsetResult.count} job code → sub-family assignments`);

  // Step 2: delete all existing sub-families
  const delResult = await prisma.jobSubFamily.deleteMany({});
  console.log(`  🗑  Deleted ${delResult.count} existing sub-families\n`);

  const families = await prisma.jobFamily.findMany({
    include: { jobCodes: { select: { id: true, code: true, title: true } } },
    orderBy: { name: 'asc' },
  });

  let totalSubFamilies = 0;
  let totalAssigned = 0;
  let totalSkipped = 0;

  for (const family of families) {
    const defs = FAMILY_MATCHERS[family.name];
    if (!defs) {
      console.log(`[SKIP] No definition for "${family.name}" — ${family.jobCodes.length} roles unassigned`);
      totalSkipped += family.jobCodes.length;
      continue;
    }

    console.log(`\n📁  ${family.name}  (${family.jobCodes.length} roles)`);

    // Create all sub-families for this family
    const sfIdMap: Record<string, string> = {};
    const uniqueNames = [...new Set(defs.map(d => d.name))];
    for (const sfName of uniqueNames) {
      const sf = await prisma.jobSubFamily.create({
        data: { name: sfName, jobFamilyId: family.id },
      });
      sfIdMap[sfName] = sf.id;
      totalSubFamilies++;
    }

    // Assign each job code — use the first def's matcher (all defs share the same logic)
    const matcher = defs[0].matcher;
    const buckets: Record<string, string[]> = {};
    for (const jc of family.jobCodes) {
      const sfName = matcher(jc.code, jc.title);
      if (!sfIdMap[sfName]) {
        console.warn(`    ⚠  No sub-family "${sfName}" for code ${jc.code} — using catch-all`);
        continue;
      }
      await prisma.jobCode.update({ where: { id: jc.id }, data: { jobSubFamilyId: sfIdMap[sfName] } });
      buckets[sfName] = [...(buckets[sfName] ?? []), `${jc.code} — ${jc.title}`];
      totalAssigned++;
    }

    for (const [sfName, codes] of Object.entries(buckets).sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`    [${codes.length}] ${sfName}`);
      for (const c of codes) console.log(`         · ${c}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`Sub-families created : ${totalSubFamilies}`);
  console.log(`Job codes assigned   : ${totalAssigned}`);
  console.log(`Job codes skipped    : ${totalSkipped}`);
  console.log('Done ✅\n');
}

main()
  .catch(e => { console.error('❌', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
