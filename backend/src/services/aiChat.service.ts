/**
 * AI Chat Service — Claude (Anthropic) with 8 live-data tools, SSE streaming, Redis history.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import { anthropic } from '../lib/claudeClient';
import { prisma } from '../lib/prisma';
import { redisClient } from '../lib/redis';
import logger from '../lib/logger';

const HISTORY_TTL   = 7 * 24 * 60 * 60; // 7 days
const SESSIONS_TTL  = 30 * 24 * 60 * 60; // 30 days
const MAX_HISTORY   = 40;
const MAX_SESSIONS  = 20;
const MODEL = process.env.OPENROUTER_API_KEY
  ? 'anthropic/claude-sonnet-4-5'
  : 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are the AI compensation intelligence assistant for this organisation.
You have access to real-time HR data via tools. ALWAYS use tools to get current data before answering — never guess or fabricate numbers.

Your role:
- Help HR make better compensation decisions with live data
- Detect pay inequities and explain them clearly
- Model compensation scenarios and explain cost impacts

Communication style:
- Lead with the key finding or number in 1 sentence.
- Use **bold** for key figures, names, and important terms.
- Use markdown tables for any list of employees, bands, or metrics with 3+ columns.
- Use bullet points for lists of items or recommendations.
- Use ## headings only when the response covers multiple distinct sections.
- Format salary amounts as "₹X.XL" (Lakhs) or "₹X.XCr" (Crores).
- Keep responses tight: 150 words for simple lookups, 300 for multi-part analysis.
- Never use filler phrases like "Great question!" or "I'll now analyse…".`;

// ── Tool Definitions ──────────────────────────────────────────
const TOOLS: Tool[] = [
  {
    name: 'get_org_summary',
    description: 'Get high-level org stats: total employees, avg compa-ratio, band breakdown, department headcounts, gender split.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_employees',
    description: 'Query active employees with optional filters. Returns name, band, department, gender, salary, compaRatio, performance rating.',
    input_schema: {
      type: 'object' as const,
      properties: {
        band:                   { type: 'string',  description: 'Filter by band code e.g. P1, P2, A1' },
        department:             { type: 'string',  description: 'Filter by department name (partial match)' },
        gender:                 { type: 'string',  enum: ['Male', 'Female', 'Other'] },
        compaRatioBelow:        { type: 'number',  description: 'Only employees with compaRatio < this value' },
        compaRatioAbove:        { type: 'number',  description: 'Only employees with compaRatio > this value' },
        performanceRatingAbove: { type: 'number',  description: 'Only employees with latest performance rating > this' },
        performanceRatingBelow: { type: 'number',  description: 'Only employees with latest performance rating < this' },
        limit:                  { type: 'number',  description: 'Max results to return (default 20, max 50)' },
      },
    },
  },
  {
    name: 'get_pay_equity_data',
    description: 'Get gender pay gap analysis, compa-ratio distribution, and pay equity metrics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        breakdown: {
          type: 'string',
          enum: ['overall', 'by_department', 'by_band'],
          description: 'How to slice the data',
        },
      },
    },
  },
  {
    name: 'get_band_analysis',
    description: 'Get salary band structure (min/mid/max) and how many employees fall below, within, or above each band.',
    input_schema: {
      type: 'object' as const,
      properties: {
        band: { type: 'string', description: 'Optional specific band to analyse e.g. P2. Omit for all bands.' },
      },
    },
  },
  {
    name: 'get_performance_pay_alignment',
    description: 'Identify performance-pay misalignment: high performers underpaid or low performers overpaid.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scenario: {
          type: 'string',
          enum: ['underpaid_top', 'overpaid_bottom', 'both'],
          description: 'Which misalignment direction to look for',
        },
      },
    },
  },
  {
    name: 'get_benefits_data',
    description: 'Get benefits utilisation rates, enrollment counts, and cost per category.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_variable_pay',
    description: 'Get variable pay analytics: total budget, avg % of fixed, breakdown by department and band.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'run_scenario',
    description: 'Simulate a what-if salary increase scenario. Returns affected count and additional cost.',
    input_schema: {
      type: 'object' as const,
      properties: {
        band:                   { type: 'string', description: 'Only apply to employees in this band' },
        department:             { type: 'string', description: 'Only apply to employees in this department' },
        percentIncrease:        { type: 'number', description: 'Percentage increase e.g. 10 for 10%' },
        absoluteIncreaseINR:    { type: 'number', description: 'Fixed INR increase per employee per year' },
        filterCompaRatioBelow:  { type: 'number', description: 'Only employees with compaRatio below this value' },
        filterPerformanceAbove: { type: 'number', description: 'Only employees with performance rating above this value' },
      },
    },
  },
];

// ── Tool Implementations ──────────────────────────────────────
async function toolGetOrgSummary() {
  const [total, avgAgg, genderGroups, deptGroups, bandGroups] = await Promise.all([
    prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
    prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } }, _avg: { compaRatio: true } }),
    prisma.employee.groupBy({ by: ['gender'], where: { employmentStatus: 'ACTIVE' }, _count: true }),
    prisma.employee.groupBy({ by: ['department'], where: { employmentStatus: 'ACTIVE' }, _count: true, orderBy: { _count: { department: 'desc' } } }),
    prisma.employee.groupBy({ by: ['band'], where: { employmentStatus: 'ACTIVE' }, _count: true }),
  ]);
  return {
    totalActiveEmployees: total,
    avgCompaRatio: Number(avgAgg._avg.compaRatio || 0).toFixed(1) + '%',
    genderBreakdown: genderGroups.map(g => ({ gender: g.gender, count: g._count })),
    departments: deptGroups.map(d => ({ department: d.department, headcount: d._count })),
    bandBreakdown: bandGroups.map(b => ({ band: b.band, headcount: b._count })),
  };
}

async function toolGetEmployees(input: Record<string, any>) {
  const where: any = { employmentStatus: 'ACTIVE' };
  if (input.band) where.band = input.band;
  if (input.department) where.department = { contains: input.department, mode: 'insensitive' };
  if (input.gender) {
    const gMap: Record<string, string> = { Male: 'MALE', Female: 'FEMALE', Other: 'NON_BINARY' };
    where.gender = gMap[input.gender] || input.gender;
  }
  if (input.compaRatioBelow !== undefined || input.compaRatioAbove !== undefined) {
    where.compaRatio = {};
    if (input.compaRatioBelow !== undefined) where.compaRatio.lt = input.compaRatioBelow;
    if (input.compaRatioAbove !== undefined) where.compaRatio.gt = input.compaRatioAbove;
  }
  const limit = Math.min(Number(input.limit) || 20, 50);

  let emps = await prisma.employee.findMany({
    where, take: limit, orderBy: { compaRatio: 'asc' },
    select: {
      firstName: true, lastName: true, employeeId: true, designation: true,
      band: true, department: true, gender: true,
      annualFixed: true, annualCtc: true, variablePay: true, compaRatio: true,
      performanceRatings: { orderBy: { createdAt: 'desc' }, take: 1, select: { rating: true } },
    },
  });

  if (input.performanceRatingAbove !== undefined)
    emps = emps.filter(e => Number(e.performanceRatings[0]?.rating || 0) > input.performanceRatingAbove);
  if (input.performanceRatingBelow !== undefined)
    emps = emps.filter(e => Number(e.performanceRatings[0]?.rating || 0) < input.performanceRatingBelow);

  return emps.map(e => ({
    name: `${e.firstName} ${e.lastName}`, employeeId: e.employeeId, designation: e.designation,
    band: e.band, department: e.department, gender: e.gender,
    annualFixedLakhs: (Number(e.annualFixed) / 100000).toFixed(1),
    variablePayLakhs: (Number(e.variablePay || 0) / 100000).toFixed(1),
    annualCtcLakhs:   (Number(e.annualCtc || 0) / 100000).toFixed(1),
    compaRatio:       Number(e.compaRatio || 0).toFixed(1) + '%',
    latestPerfRating: e.performanceRatings[0]?.rating ? Number(e.performanceRatings[0].rating) : null,
  }));
}

async function toolGetVariablePay() {
  const emps = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE' },
    select: { firstName: true, lastName: true, department: true, band: true, annualFixed: true, variablePay: true },
  });
  const withVar = emps.filter(e => Number(e.variablePay) > 0);
  const totalVarLakhs = withVar.reduce((s, e) => s + Number(e.variablePay), 0) / 100000;
  const avgVarPct = withVar.length > 0
    ? withVar.reduce((s, e) => s + (Number(e.annualFixed) > 0 ? Number(e.variablePay) / Number(e.annualFixed) * 100 : 0), 0) / withVar.length
    : 0;
  const byDept: Record<string, { total: number; count: number }> = {};
  const byBand: Record<string, { total: number; count: number }> = {};
  for (const e of withVar) {
    const d = e.department || 'Unknown'; const b = e.band || 'Unknown';
    if (!byDept[d]) byDept[d] = { total: 0, count: 0 }; if (!byBand[b]) byBand[b] = { total: 0, count: 0 };
    byDept[d].total += Number(e.variablePay); byDept[d].count++;
    byBand[b].total += Number(e.variablePay); byBand[b].count++;
  }
  const top5 = [...withVar].sort((a, b) => Number(b.variablePay) - Number(a.variablePay)).slice(0, 5)
    .map(e => ({ name: `${e.firstName} ${e.lastName}`, band: e.band, variablePayLakhs: (Number(e.variablePay) / 100000).toFixed(1) }));
  return {
    totalEmployeesWithVariablePay: withVar.length, totalVariableBudgetLakhs: totalVarLakhs.toFixed(1),
    avgVariablePctOfFixed: avgVarPct.toFixed(1) + '%',
    byDepartment: Object.entries(byDept).map(([dept, v]) => ({ dept, totalLakhs: (v.total / 100000).toFixed(1), count: v.count })).sort((a, b) => Number(b.totalLakhs) - Number(a.totalLakhs)),
    byBand: Object.entries(byBand).map(([band, v]) => ({ band, totalLakhs: (v.total / 100000).toFixed(1), count: v.count })),
    top5Earners: top5,
  };
}

async function toolGetPayEquityData(input: Record<string, any>) {
  const breakdown = input.breakdown || 'overall';
  if (breakdown === 'overall') {
    const [mAgg, fAgg, compaAgg] = await Promise.all([
      prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE', gender: 'MALE' },   _avg: { annualFixed: true }, _count: true }),
      prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE', gender: 'FEMALE' }, _avg: { annualFixed: true }, _count: true }),
      prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } }, _avg: { compaRatio: true }, _min: { compaRatio: true }, _max: { compaRatio: true } }),
    ]);
    const mAvg = Number(mAgg._avg?.annualFixed || 0); const fAvg = Number(fAgg._avg?.annualFixed || 0);
    return {
      genderPayGapPercent: (mAvg > 0 ? ((mAvg - fAvg) / mAvg * 100).toFixed(1) : '0') + '%',
      maleAvgLakhs: (mAvg / 100000).toFixed(1), maleCount: mAgg._count,
      femaleAvgLakhs: (fAvg / 100000).toFixed(1), femaleCount: fAgg._count,
      avgCompaRatio: Number(compaAgg._avg.compaRatio || 0).toFixed(1) + '%',
    };
  }
  if (breakdown === 'by_department') {
    const rows = await prisma.employee.groupBy({ by: ['department', 'gender'], where: { employmentStatus: 'ACTIVE' }, _avg: { annualFixed: true }, _count: true });
    const map: Record<string, any> = {};
    for (const r of rows) { if (!map[r.department]) map[r.department] = {}; map[r.department][r.gender as string] = { avgSalaryLakhs: (Number(r._avg?.annualFixed || 0) / 100000).toFixed(1), count: r._count }; }
    return Object.entries(map).map(([dept, data]: [string, any]) => {
      const mA = Number(data.MALE?.avgSalaryLakhs || 0); const fA = Number(data.FEMALE?.avgSalaryLakhs || 0);
      return { department: dept, male: data.MALE, female: data.FEMALE, gapPercent: mA > 0 ? ((mA - fA) / mA * 100).toFixed(1) + '%' : 'N/A' };
    });
  }
  if (breakdown === 'by_band') {
    const rows = await prisma.employee.groupBy({ by: ['band', 'gender'], where: { employmentStatus: 'ACTIVE' }, _avg: { annualFixed: true, compaRatio: true }, _count: true });
    const map: Record<string, any> = {};
    for (const r of rows) { if (!map[r.band]) map[r.band] = {}; map[r.band][r.gender as string] = { avgSalaryLakhs: (Number(r._avg?.annualFixed || 0) / 100000).toFixed(1), avgCompaRatio: Number(r._avg?.compaRatio || 0).toFixed(1) + '%', count: r._count }; }
    return Object.entries(map).map(([band, data]) => ({ band, ...(data as any) }));
  }
  return { error: 'Invalid breakdown' };
}

async function toolGetBandAnalysis(input: Record<string, any>) {
  const where: any = input.band ? { band: { code: input.band } } : {};
  const bands = await prisma.salaryBand.findMany({ where, include: { band: true, jobArea: true }, orderBy: { band: { code: 'asc' } } });
  return Promise.all(bands.map(async (sb) => {
    const [below, within, above] = await Promise.all([
      prisma.employee.count({ where: { employmentStatus: 'ACTIVE', band: sb.band.code, annualFixed: { lt: sb.minSalary } } }),
      prisma.employee.count({ where: { employmentStatus: 'ACTIVE', band: sb.band.code, annualFixed: { gte: sb.minSalary, lte: sb.maxSalary } } }),
      prisma.employee.count({ where: { employmentStatus: 'ACTIVE', band: sb.band.code, annualFixed: { gt: sb.maxSalary } } }),
    ]);
    return { band: sb.band.code, jobArea: sb.jobArea?.name || 'All', minLakhs: (Number(sb.minSalary) / 100000).toFixed(1), midLakhs: (Number(sb.midSalary) / 100000).toFixed(1), maxLakhs: (Number(sb.maxSalary) / 100000).toFixed(1), below, within, above };
  }));
}

async function toolGetPerformancePayAlignment(input: Record<string, any>) {
  const scenario = input.scenario || 'both';
  const emps = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
    select: { firstName: true, lastName: true, department: true, band: true, annualFixed: true, compaRatio: true, performanceRatings: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { rating: true } } },
  });
  const enriched = emps.filter(e => e.performanceRatings[0]?.rating).map(e => ({
    name: `${e.firstName} ${e.lastName}`, department: e.department, band: e.band,
    salaryLakhs: (Number(e.annualFixed) / 100000).toFixed(1),
    compaRatio: Number(e.compaRatio), performanceRating: Number(e.performanceRatings[0].rating),
  }));
  const underpaidTop   = scenario !== 'overpaid_bottom' ? enriched.filter(e => e.performanceRating >= 4 && e.compaRatio < 90).sort((a, b) => a.compaRatio - b.compaRatio) : [];
  const overpaidBottom = scenario !== 'underpaid_top'   ? enriched.filter(e => e.performanceRating <= 2 && e.compaRatio > 110).sort((a, b) => b.compaRatio - a.compaRatio) : [];
  const fmt = (e: typeof enriched[0]) => ({ ...e, compaRatio: e.compaRatio.toFixed(1) + '%' });
  return { summary: `${underpaidTop.length} high performers underpaid, ${overpaidBottom.length} low performers overpaid`, highPerformersUnderpaid: underpaidTop.map(fmt), lowPerformersOverpaid: overpaidBottom.map(fmt) };
}

async function toolGetBenefitsData() {
  const [catalog, enrollments, totalEmp] = await Promise.all([
    prisma.benefitsCatalog.findMany({ where: { isActive: true } }),
    prisma.employeeBenefit.groupBy({ by: ['benefitId', 'status'], _count: true }),
    prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
  ]);
  return catalog.map(b => {
    const enrolled = enrollments.find(e => e.benefitId === b.id && e.status === 'ACTIVE')?._count || 0;
    return { name: b.name, category: b.category, enrolledCount: enrolled, utilizationPct: totalEmp > 0 ? ((enrolled / totalEmp) * 100).toFixed(1) + '%' : '0%', annualValueINR: b.annualValue ? `₹${Number(b.annualValue).toLocaleString()}` : 'N/A' };
  });
}

async function toolRunScenario(input: Record<string, any>) {
  const where: any = { employmentStatus: 'ACTIVE' };
  if (input.band) where.band = input.band;
  if (input.department) where.department = { contains: input.department, mode: 'insensitive' };
  if (input.filterCompaRatioBelow !== undefined) where.compaRatio = { lt: input.filterCompaRatioBelow };
  let emps = await prisma.employee.findMany({ where, select: { firstName: true, lastName: true, band: true, annualFixed: true, performanceRatings: { orderBy: { createdAt: 'desc' }, take: 1, select: { rating: true } } } });
  if (input.filterPerformanceAbove !== undefined)
    emps = emps.filter(e => Number(e.performanceRatings[0]?.rating || 0) > input.filterPerformanceAbove);
  const totalCurrent = emps.reduce((s, e) => s + Number(e.annualFixed), 0);
  let additionalCost = 0;
  for (const e of emps) {
    if (input.percentIncrease)          additionalCost += Number(e.annualFixed) * (input.percentIncrease / 100);
    else if (input.absoluteIncreaseINR) additionalCost += input.absoluteIncreaseINR;
  }
  return { affectedEmployees: emps.length, currentPayrollLakhs: (totalCurrent / 100000).toFixed(1), additionalCostLakhs: (additionalCost / 100000).toFixed(1), additionalCostCrores: (additionalCost / 10000000).toFixed(2), pctOfPayroll: totalCurrent > 0 ? ((additionalCost / totalCurrent) * 100).toFixed(1) + '%' : '0%', sampleEmployees: emps.slice(0, 5).map(e => `${e.firstName} ${e.lastName} (${e.band}, ₹${(Number(e.annualFixed)/100000).toFixed(1)}L)`) };
}

async function executeTool(name: string, args: Record<string, any>): Promise<Record<string, unknown>> {
  logger.info(`AI tool call: ${name}`);
  try {
    switch (name) {
      case 'get_org_summary':               return await toolGetOrgSummary();
      case 'get_employees':                 return { employees: await toolGetEmployees(args) };
      case 'get_pay_equity_data':           return { data: await toolGetPayEquityData(args) };
      case 'get_band_analysis':             return { bands: await toolGetBandAnalysis(args) };
      case 'get_performance_pay_alignment': return await toolGetPerformancePayAlignment(args);
      case 'get_benefits_data':             return { benefits: await toolGetBenefitsData() };
      case 'get_variable_pay':              return await toolGetVariablePay();
      case 'run_scenario':                  return await toolRunScenario(args);
      default:                              return { error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    const isConnErr = err.message?.includes('closed') || err.message?.includes('connect') || err.code === 'P1001' || err.code === 'P1017';
    if (isConnErr) {
      // Neon cold-start: wait for reconnect and retry once
      logger.warn(`Tool ${name}: DB connection lost — retrying after wake…`);
      await new Promise(r => setTimeout(r, 2500));
      try {
        switch (name) {
          case 'get_org_summary':               return await toolGetOrgSummary();
          case 'get_employees':                 return { employees: await toolGetEmployees(args) };
          case 'get_pay_equity_data':           return { data: await toolGetPayEquityData(args) };
          case 'get_band_analysis':             return { bands: await toolGetBandAnalysis(args) };
          case 'get_performance_pay_alignment': return await toolGetPerformancePayAlignment(args);
          case 'get_benefits_data':             return { benefits: await toolGetBenefitsData() };
          case 'get_variable_pay':              return await toolGetVariablePay();
          case 'run_scenario':                  return await toolRunScenario(args);
          default:                              return { error: `Unknown tool: ${name}` };
        }
      } catch (retryErr: any) {
        logger.error(`Tool ${name} retry failed:`, retryErr.message);
        return { error: 'Database is waking up — please try again in a moment.' };
      }
    }
    logger.error(`Tool ${name} error:`, err.message);
    return { error: err.message };
  }
}

// ── History & Session Helpers ─────────────────────────────────
const histKey     = (userId: string) => `chat:${userId}:history`;
const sessionsKey = (userId: string) => `chat:${userId}:sessions`;
const sessionKey  = (userId: string, id: string) => `chat:${userId}:session:${id}`;

export interface ChatSessionMeta {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  messageCount: number;
}

function deriveTitle(history: MessageParam[]): string {
  const firstUser = history.find(m => m.role === 'user');
  if (!firstUser) return 'Conversation';
  const text = typeof firstUser.content === 'string'
    ? firstUser.content
    : (firstUser.content as any[]).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return text.trim().slice(0, 60) || 'Conversation';
}

export async function getHistory(userId: string): Promise<MessageParam[]> {
  try {
    const raw = await redisClient.get(histKey(userId));
    return raw ? (JSON.parse(raw) as MessageParam[]) : [];
  } catch { return []; }
}

export async function saveHistory(userId: string, history: MessageParam[]): Promise<void> {
  const trimmed = history.slice(-MAX_HISTORY);
  await redisClient.setex(histKey(userId), HISTORY_TTL, JSON.stringify(trimmed));
}

/** Archive current conversation to sessions list, then clear active history */
export async function clearHistory(userId: string): Promise<void> {
  try {
    const history = await getHistory(userId);
    if (history.length > 0) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const userTurns = history.filter(m => m.role === 'user');
      const title   = deriveTitle(history);
      const preview = deriveTitle(history);
      const meta: ChatSessionMeta = {
        id, title, preview,
        createdAt: new Date().toISOString(),
        messageCount: userTurns.length,
      };
      // Save full history for this session
      await redisClient.setex(sessionKey(userId, id), SESSIONS_TTL, JSON.stringify(history));
      // Prepend to sessions list (keep last MAX_SESSIONS)
      const raw = await redisClient.get(sessionsKey(userId));
      const sessions: ChatSessionMeta[] = raw ? JSON.parse(raw) : [];
      sessions.unshift(meta);
      if (sessions.length > MAX_SESSIONS) sessions.length = MAX_SESSIONS;
      await redisClient.setex(sessionsKey(userId), SESSIONS_TTL, JSON.stringify(sessions));
    }
  } catch (e) { logger.error('clearHistory archive error:', e); }
  await redisClient.del(histKey(userId));
}

export async function getSessions(userId: string): Promise<ChatSessionMeta[]> {
  try {
    const raw = await redisClient.get(sessionsKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function getSessionMessages(userId: string, sessionId: string): Promise<MessageParam[]> {
  try {
    const raw = await redisClient.get(sessionKey(userId, sessionId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  const raw = await redisClient.get(sessionsKey(userId));
  if (!raw) return;
  const sessions: ChatSessionMeta[] = JSON.parse(raw);
  const updated = sessions.filter(s => s.id !== sessionId);
  await Promise.all([
    redisClient.setex(sessionsKey(userId), SESSIONS_TTL, JSON.stringify(updated)),
    redisClient.del(sessionKey(userId, sessionId)),
  ]);
}

// ── SSE Stream Chat (Agentic Loop) ────────────────────────────
export async function streamChat(
  userId:      string,
  userMessage: string,
  onText:      (text: string) => void,
  onToolCall:  (toolName: string) => void,
  onDone:      () => void,
  onError:     (err: Error) => void,
): Promise<void> {
  // Wake Neon DB before any tool calls — same pattern as gatherOrgSnapshot
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    await new Promise(r => setTimeout(r, 2000));
    try { await prisma.$queryRaw`SELECT 1`; } catch { /* will retry inside tool calls */ }
  }

  const history = await getHistory(userId);
  const messages: MessageParam[] = [...history, { role: 'user', content: userMessage }];

  try {
    const MAX_ROUNDS = 5;

    for (let round = 0; round <= MAX_ROUNDS; round++) {
      const stream = await anthropic.messages.stream({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      let assistantContent: Anthropic.Messages.ContentBlock[] = [];

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          onText(event.delta.text);
        }
      }

      const finalMessage = await stream.finalMessage();
      assistantContent = finalMessage.content;
      messages.push({ role: 'assistant', content: assistantContent });

      // Check if Claude wants to use tools
      const toolUseBlocks = assistantContent.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0 || finalMessage.stop_reason === 'end_turn') {
        break;
      }

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (tb) => {
          onToolCall(tb.name);
          const result = await executeTool(tb.name, tb.input as Record<string, any>);
          return {
            type: 'tool_result' as const,
            tool_use_id: tb.id,
            content: JSON.stringify(result),
          };
        })
      );

      messages.push({ role: 'user', content: toolResults });
    }

    // Save history (exclude system messages — only user/assistant turns)
    await saveHistory(userId, messages);
    onDone();
  } catch (err: any) {
    logger.error('AI chat error:', err.message);
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
