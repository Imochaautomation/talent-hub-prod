/**
 * aiReport — Streaming Leadership Report (Phase 5.1)
 * SSE event format:
 *   event: section_start  data: { index, title }
 *   event: text           data: { delta }
 *   event: section_end    data: { index }
 *   event: done           data: {}
 *   event: error          data: { message }
 */

import type { Response } from 'express';
import { anthropic } from '../lib/claudeClient';
import { gatherOrgSnapshot } from './orgSnapshot';
import logger from '../lib/logger';

const MODEL = process.env.OPENROUTER_API_KEY
  ? 'anthropic/claude-sonnet-4-5'
  : 'claude-sonnet-4-6';

const REPORT_SECTIONS = [
  {
    title: 'Compensation Health Overview',
    prompt: (ctx: string) =>
      `${ctx}\n\nWrite a concise executive summary (3-4 sentences) of the current compensation health of this organization. Include: pay equity status, average compa-ratio and what it means, percentage of employees outside salary bands, and one headline risk. Use specific numbers from the data. Start directly with content, no heading needed.`,
  },
  {
    title: 'Critical Issues Requiring Immediate Action',
    prompt: (ctx: string) =>
      `${ctx}\n\nList the TOP 3 most urgent compensation issues that require HR action this week. For each issue:\n- Bold title\n- 2-sentence explanation of the problem\n- Specific employee count or department affected (use real numbers)\n- 1 concrete recommended action with rough cost estimate in Lakhs\n\nBe direct and specific. Use markdown formatting.`,
  },
  {
    title: 'Pay Equity Analysis',
    prompt: (ctx: string) =>
      `${ctx}\n\nProvide a pay equity analysis covering:\n1. Overall gender pay gap (exact %)\n2. The 2 departments with the largest gender pay disparities\n3. Root cause analysis\n4. 2 corrective actions with estimated budget impact in Lakhs\n\nUse markdown headers. Be specific with numbers.`,
  },
  {
    title: 'Compensation Strategy Recommendation',
    prompt: (ctx: string) =>
      `${ctx}\n\nPropose ONE compensation scenario that would most improve pay equity and retention. Include:\n- Which employees benefit (bands, departments, criteria)\n- Estimated total cost in Lakhs and % of payroll\n- Expected impact on gender pay gap\n- Implementation timeline (30/60/90 days)\n\nBe specific. Use markdown formatting.`,
  },
  {
    title: '30-Day HR Action Plan',
    prompt: (ctx: string) =>
      `${ctx}\n\nWrite a 30-day action plan for the Head of HR. List exactly 5 specific, measurable actions (numbered). Each action should have a clear owner, be achievable in 30 days, and include a measurable success metric. Address: pay equity, band compliance, RSU management, benefits adoption, and performance-pay alignment. Use markdown formatting.`,
  },
];

const SYSTEM_INSTRUCTION = `You are CompSense AI — an expert compensation strategist preparing a board-ready leadership briefing.
Be specific, use exact numbers from the data provided, and make every recommendation actionable.
Write in clear, professional prose suitable for a CFO/CHRO audience.`;

export async function streamLeadershipReport(res: Response): Promise<void> {
  const send = (event: string, data: object) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send('progress', { message: 'Gathering live org data…', step: 0, total: REPORT_SECTIONS.length });
    const snapshot = await gatherOrgSnapshot();
    const ctx = buildContext(snapshot);

    // Announce all sections upfront so the UI can render placeholders.
    for (let i = 0; i < REPORT_SECTIONS.length; i++) {
      send('section_start', { index: i, title: REPORT_SECTIONS[i].title });
    }

    // Run all 5 Claude streams in parallel. Deltas are tagged with `index` so
    // the frontend routes them to the correct section even though chunks
    // from different sections interleave on the wire.
    // Writes to the SSE response are serialized by Node's single-threaded
    // event loop — safe under concurrent emitters.
    const t0 = Date.now();
    await Promise.all(
      REPORT_SECTIONS.map(async (section, index) => {
        const stream = await anthropic.messages.stream({
          model: MODEL,
          max_tokens: 800,
          system: SYSTEM_INSTRUCTION,
          messages: [{ role: 'user', content: section.prompt(ctx) }],
        });
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send('text', { delta: event.delta.text, index });
          }
        }
        send('section_end', { index });
        logger.info(`[AI Report] Section ${index + 1}/${REPORT_SECTIONS.length} complete: "${section.title}"`);
      })
    );

    send('done', {});
    logger.info(`[AI Report] Report generation complete in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err: any) {
    logger.error('[AI Report] Error:', err);
    send('error', { message: err.message || 'Report generation failed' });
  } finally {
    res.end();
  }
}

function buildContext(snapshot: Awaited<ReturnType<typeof gatherOrgSnapshot>>): string {
  const totalPayrollLakhs = snapshot.employees.reduce((s, e) => s + e.annualFixedLakhs, 0);

  const gapByDept: Record<string, { male?: number; female?: number }> = {};
  for (const g of snapshot.genderByDept) {
    if (!gapByDept[g.department]) gapByDept[g.department] = {};
    if (g.gender === 'MALE') gapByDept[g.department].male = g.avgLakhs;
    if (g.gender === 'FEMALE') gapByDept[g.department].female = g.avgLakhs;
  }

  const deptGaps = Object.entries(gapByDept)
    .filter(([, v]) => v.male && v.female)
    .map(([dept, v]) => ({
      dept,
      gapPct: (((v.male! - v.female!) / v.male!) * 100).toFixed(1),
      maleLakhs: v.male!,
      femaleLakhs: v.female!,
    }))
    .sort((a, b) => parseFloat(b.gapPct) - parseFloat(a.gapPct));

  const withCR = snapshot.employees.filter(e => e.compaRatio !== null);
  const below80  = withCR.filter(e => (e.compaRatio ?? 0) < 80).length;
  const above120 = withCR.filter(e => (e.compaRatio ?? 0) > 120).length;

  const underpaidHighPerf = snapshot.employees.filter(
    e => (e.latestPerfRating ?? 0) >= 4 && (e.compaRatio ?? 100) < 90
  );

  return `ORG COMPENSATION SNAPSHOT — ${snapshot.generatedAt}
====================================================
Total active employees: ${snapshot.totalEmployees}
Total annual payroll: ₹${totalPayrollLakhs.toFixed(0)}L (₹${(totalPayrollLakhs / 100).toFixed(1)}Cr)
Average compa-ratio: ${snapshot.avgCompaRatio}%
Employees with CR < 80%: ${below80}
Employees with CR > 120%: ${above120}

SALARY BANDS:
${snapshot.bands.map(b => `  ${b.code}: Min ₹${b.minLakhs}L | Mid ₹${b.midLakhs}L | Max ₹${b.maxLakhs}L`).join('\n')}

GENDER PAY GAP BY DEPARTMENT:
${deptGaps.map(d => `  ${d.dept}: Men ₹${d.maleLakhs}L, Women ₹${d.femaleLakhs}L — Gap: ${d.gapPct}%`).join('\n')}

HIGH PERFORMERS UNDERPAID (perf ≥ 4, CR < 90%):
${underpaidHighPerf.length} employees — ${underpaidHighPerf.slice(0, 5).map(e => `${e.name} (${e.band}, CR ${e.compaRatio}%, perf ${e.latestPerfRating})`).join(', ')}${underpaidHighPerf.length > 5 ? ` and ${underpaidHighPerf.length - 5} more` : ''}

RSU CLIFF EXPOSURE (employees with significant unvested grants):
${snapshot.rsuCliff.length === 0 ? '  None' : snapshot.rsuCliff.map(r => `  ${r.employeeName}: ₹${r.unvestedLakhs}L unvested (${r.vestingPct}% vested)`).join('\n')}

BENEFITS UTILIZATION:
${snapshot.benefits.map(b => `  ${b.name} (${b.category}): ${b.utilizationPct}% utilization`).join('\n')}`;
}
