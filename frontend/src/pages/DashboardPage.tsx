import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users, DollarSign, TrendingUp, AlertTriangle, Scale,
  BarChart3, Layers, Sparkles, GitBranch,
  Gift, Award, Bell, ArrowUpRight, ArrowDownRight,
  ChevronRight, Building2, Zap, Info,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { cn, getBandColor } from '../lib/utils';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ── Services ──────────────────────────────────────────────────
const dashboardApi = {
  getKpis: async () => { const r = await api.get('/dashboard/kpis'); return r.data; },
  getBandDistribution: async () => { const r = await api.get('/dashboard/band-distribution'); return r.data; },
  getSalaryDistribution: async () => { const r = await api.get('/dashboard/salary-distribution'); return r.data; },
  getCompVsPerformance: async () => { const r = await api.get('/dashboard/comp-vs-performance'); return r.data; },
  getDeptPayEquityHeatmap: async () => { const r = await api.get('/dashboard/dept-pay-equity-heatmap'); return r.data; },
  getRsuVestingTimeline: async () => { const r = await api.get('/dashboard/rsu-vesting-timeline'); return r.data; },
  getAttritionRisk: async () => { const r = await api.get('/dashboard/attrition-risk'); return r.data; },
  getActionRequired: async () => { const r = await api.get('/dashboard/action-required'); return r.data; },
  getAISummary: async () => { const r = await api.get('/ai-insights/dashboard-summary'); return r.data; },
};

const BAND_PIE_COLORS = ['#64748b','#3b82f6','#6366f1','#8b5cf6','#a855f7','#f59e0b'];
const ATTRITION_COLORS: Record<string, string> = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' };

const KPI_ACCENT_COLORS = [
  'linear-gradient(90deg,#7c3aed,#a78bfa)',
  'linear-gradient(90deg,#0284c7,#38bdf8)',
  'linear-gradient(90deg,#059669,#34d399)',
  'linear-gradient(90deg,#dc2626,#f87171)',
  'linear-gradient(90deg,#d97706,#fcd34d)',
];

// ── KPI Card ──────────────────────────────────────────────────
function KPICard({
  title, value, subtitle, icon: Icon, color = 'text-foreground', trend, alert, accentIndex = 0,
}: {
  title: string; value: string | number; subtitle?: string;
  icon: React.ElementType; color?: string;
  trend?: { direction: 'up' | 'down' | 'neutral'; label: string };
  alert?: boolean;
  accentIndex?: number;
}) {
  return (
    <div
      className="rounded-[14px] bg-card border border-border relative overflow-hidden pt-[18px] px-[18px] pb-[18px]"
      style={{ boxShadow: 'var(--shadow-lg)' }}
    >
      {/* Colored top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[14px]"
        style={{ background: alert ? 'linear-gradient(90deg,#dc2626,#f87171)' : KPI_ACCENT_COLORS[accentIndex % KPI_ACCENT_COLORS.length] }}
      />
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.05em]">{title}</p>
          <p className={cn('text-2xl font-extrabold mt-1 tracking-tight truncate', color, alert && 'text-red-600 dark:text-red-400')}>
            {value}
          </p>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
          {trend && (
            <div className={cn('flex items-center gap-1 mt-1.5 text-[11px] font-medium',
              trend.direction === 'up' ? 'text-green-600' : trend.direction === 'down' ? 'text-red-600' : 'text-muted-foreground'
            )}>
              {trend.direction === 'up' ? <ArrowUpRight className="w-3 h-3" /> : trend.direction === 'down' ? <ArrowDownRight className="w-3 h-3" /> : null}
              {trend.label}
            </div>
          )}
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-3',
          alert ? 'bg-red-100 dark:bg-red-900/30' : 'bg-primary/10'
        )}>
          <Icon className={cn('w-5 h-5', alert ? 'text-red-600 dark:text-red-400' : 'text-primary')} />
        </div>
      </div>
    </div>
  );
}

function KPISkeleton() {
  return (
    <div className="rounded-[14px] border border-border pt-[18px] px-[18px] pb-[18px] bg-card relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[14px] bg-muted/60 animate-pulse" />
      <div className="h-3 w-24 bg-muted/60 rounded animate-pulse mb-3" />
      <div className="h-7 w-32 bg-muted/60 rounded animate-pulse mb-2" />
      <div className="h-3 w-20 bg-muted/60 rounded animate-pulse" />
    </div>
  );
}

// ── Quick Links ───────────────────────────────────────────────
const QUICK_LINKS = [
  { to: '/compensation', label: 'Compensation Hub', icon: Building2, color: 'text-violet-500' },
  { to: '/benefits-hub', label: 'Benefits Hub', icon: Gift, color: 'text-teal-500' },
  { to: '/job-architecture', label: 'Employees', icon: Users, color: 'text-blue-500' },
  { to: '/pay-equity', label: 'Pay Equity', icon: Scale, color: 'text-purple-500' },
  { to: '/performance', label: 'Performance', icon: TrendingUp, color: 'text-emerald-500' },
  { to: '/salary-bands', label: 'Salary Bands', icon: BarChart3, color: 'text-indigo-500' },
  { to: '/rsu', label: 'RSU Tracker', icon: Award, color: 'text-cyan-500' },
  { to: '/variable-pay', label: 'Variable Pay', icon: Zap, color: 'text-sky-500' },
  { to: '/scenarios', label: 'Scenarios', icon: GitBranch, color: 'text-orange-500' },
  { to: '/notifications', label: 'Notifications', icon: Bell, color: 'text-amber-500' },
  { to: '/job-architecture', label: 'Job Architecture', icon: Layers, color: 'text-rose-500' },
];

const ACTION_ICON: Record<string, React.ElementType> = {
  band: AlertTriangle, equity: Scale, rsu: Award, performance: TrendingUp,
};

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0] || 'there';

  const { data: kpisRaw, isLoading: kpisLoading } = useQuery({
    queryKey: queryKeys.dashboard.kpis,
    queryFn: dashboardApi.getKpis,
    staleTime: STALE_TIMES.LIVE,
  });

  const { data: bandDistRaw } = useQuery({
    queryKey: queryKeys.dashboard.bandDistribution,
    queryFn: dashboardApi.getBandDistribution,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: salaryDistRaw } = useQuery({
    queryKey: queryKeys.dashboard.salaryDistribution,
    queryFn: dashboardApi.getSalaryDistribution,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: compVsPerfRaw } = useQuery({
    queryKey: ['dashboard', 'comp-vs-performance'],
    queryFn: dashboardApi.getCompVsPerformance,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: deptHeatmapRaw } = useQuery({
    queryKey: ['dashboard', 'dept-pay-equity-heatmap'],
    queryFn: dashboardApi.getDeptPayEquityHeatmap,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: rsuTimelineRaw } = useQuery({
    queryKey: ['dashboard', 'rsu-vesting-timeline'],
    queryFn: dashboardApi.getRsuVestingTimeline,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: attritionRaw } = useQuery({
    queryKey: ['dashboard', 'attrition-risk'],
    queryFn: dashboardApi.getAttritionRisk,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: actionRaw } = useQuery({
    queryKey: ['dashboard', 'action-required'],
    queryFn: dashboardApi.getActionRequired,
    staleTime: STALE_TIMES.LIVE,
  });

  const { data: aiSummaryRaw } = useQuery({
    queryKey: ['dashboard', 'ai-summary'],
    queryFn: dashboardApi.getAISummary,
    staleTime: 30 * 60 * 1000,
  });

  const kpis: any = (kpisRaw as any)?.data ?? kpisRaw;
  const bandDist: any[] = (bandDistRaw as any)?.data ?? (Array.isArray(bandDistRaw) ? bandDistRaw : []);
  const salaryDist: any[] = (salaryDistRaw as any)?.data ?? (Array.isArray(salaryDistRaw) ? salaryDistRaw : []);
  const compVsPerf: any[] = (compVsPerfRaw as any)?.data ?? (Array.isArray(compVsPerfRaw) ? compVsPerfRaw : []);
  const deptHeatmap: any[] = (deptHeatmapRaw as any)?.data ?? (Array.isArray(deptHeatmapRaw) ? deptHeatmapRaw : []);
  const rsuTimeline: any[] = (rsuTimelineRaw as any)?.data ?? (Array.isArray(rsuTimelineRaw) ? rsuTimelineRaw : []);
  const attrition: any[] = (attritionRaw as any)?.data ?? (Array.isArray(attritionRaw) ? attritionRaw : []);
  const actionItems: any[] = (actionRaw as any)?.data ?? (Array.isArray(actionRaw) ? actionRaw : []);
  const aiSummary: string = (aiSummaryRaw as any)?.data?.summary ?? '';

  // Derive pay–performance risk list from scatter data
  const riskRows = compVsPerf
    .reduce((acc: any[], e: any) => {
      const rating = Number(e.performanceRating) || 0;
      const cr = Number(e.compaRatio) || 100;
      if (rating >= 4.0 && cr < 95)
        acc.push({ ...e, riskLabel: 'Underpaid Star', _priority: 1, _score: (100 - cr) + rating * 5 });
      else if (rating < 3 && cr >= 100)
        acc.push({ ...e, riskLabel: 'Overpaid / Low Perf', _priority: 2, _score: (cr - 100) + (5 - rating) * 3 });
      return acc;
    }, [])
    .sort((a: any, b: any) => a._priority - b._priority || b._score - a._score)
    .slice(0, 8);

  const gapColor = (pct: number) =>
    Math.abs(pct) < 5 ? 'text-green-600' : Math.abs(pct) < 10 ? 'text-amber-600' : 'text-red-600';

  return (
    <div>
      {/* ── Hero Banner — bleeds out of AppShell p-6 ── */}
      <div
        className="-mx-6 -mt-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 55%, #06b6d4 100%)',
          padding: '26px 32px 64px',
        }}
      >
        {/* Decorative circles */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{ top: -50, right: -50, width: 220, height: 220, background: 'rgba(255,255,255,0.06)' }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{ bottom: -30, left: '32%', width: 160, height: 160, background: 'rgba(255,255,255,0.04)' }}
        />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-extrabold text-white tracking-tight">
              {greeting}, {firstName}! 👋
            </h1>
            <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
              FY 2025–26 · Compensation Intelligence Platform · Live data
            </p>
          </div>
          <Link to="/leadership-report">
            <button
              className="text-[12px] font-semibold text-white flex-shrink-0 transition-colors hover:bg-white/20"
              style={{
                padding: '7px 15px',
                borderRadius: 9,
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            >
              View Leadership Report →
            </button>
          </Link>
        </div>
      </div>

      {/* ── KPI Cards — float below hero ── */}
      <div className="-mt-10 mb-6 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {kpisLoading ? (
            Array.from({ length: 5 }).map((_, i) => <KPISkeleton key={i} />)
          ) : kpis ? (
            <>
              <KPICard title="Total Employees" value={kpis.totalEmployees?.toLocaleString('en-IN')} icon={Users} subtitle="Active headcount" accentIndex={0} />
              <KPICard title="Annual CTC" value={`₹${(kpis.totalAnnualCtcCrores ?? 0).toFixed(1)}Cr`} icon={DollarSign} subtitle="Total spend" accentIndex={1} />
              <KPICard
                title="Avg Compa-Ratio"
                value={`${(kpis.avgCompaRatio ?? 0).toFixed(1)}%`}
                icon={TrendingUp}
                subtitle="Market position"
                color={(kpis.avgCompaRatio ?? 0) < 80 ? 'text-red-600' : (kpis.avgCompaRatio ?? 0) > 120 ? 'text-orange-600' : 'text-green-600'}
                accentIndex={2}
              />
              <KPICard title="Outside Bands" value={kpis.employeesOutsideBand ?? 0} icon={AlertTriangle} subtitle="Need attention" alert={(kpis.employeesOutsideBand ?? 0) > 0} accentIndex={3} />
              <KPICard
                title="Gender Pay Gap"
                value={`${Math.abs(kpis.genderPayGapPercent ?? 0).toFixed(1)}%`}
                icon={Scale}
                subtitle="Male vs Female avg"
                color={gapColor(kpis.genderPayGapPercent ?? 0)}
                accentIndex={4}
              />
            </>
          ) : null}
        </div>
      </div>

      <div className="space-y-6">
      {/* ── AI Summary ── */}
      {aiSummary && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-3 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-sm text-foreground leading-relaxed">{aiSummary}</p>
        </div>
      )}

      {/* ── Action Required Panel ── */}
      {actionItems.length > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Action Required</h3>
          </div>
          <div className="space-y-2">
            {actionItems.map((item: any, i: number) => {
              const Icon = ACTION_ICON[item.type] ?? AlertTriangle;
              return (
                <Link
                  key={i}
                  to={item.link}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                    item.severity === 'high'
                      ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50'
                      : 'border-amber-200 dark:border-amber-800 bg-white dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                  )}
                >
                  <Icon className={cn('w-4 h-4 flex-shrink-0',
                    item.severity === 'high' ? 'text-red-500' : 'text-amber-500'
                  )} />
                  <span className="flex-1 text-sm text-foreground">{item.message}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Row 2: Salary Dist + Band Dist ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Salary Distribution */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Salary Distribution</h3>
          {salaryDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salaryDist} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Employees" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex items-center justify-center">
              <div className="h-40 w-full bg-muted/30 rounded animate-pulse" />
            </div>
          )}
        </div>

        {/* Band Distribution Donut */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Headcount by Band</h3>
          {bandDist.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={bandDist} dataKey="count" nameKey="band" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {bandDist.map((_entry, index) => (
                      <Cell key={index} fill={BAND_PIE_COLORS[index % BAND_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [v, `Band ${name}`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {bandDist.map((item, i) => (
                  <div key={item.band} className="flex items-center gap-2 text-sm">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: BAND_PIE_COLORS[i % BAND_PIE_COLORS.length] }} />
                    <span className={cn('px-1.5 py-0.5 rounded text-xs font-bold', getBandColor(item.band))}>{item.band}</span>
                    <span className="text-foreground font-medium ml-auto">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center">
              <div className="h-40 w-40 rounded-full bg-muted/30 animate-pulse" />
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2 + 3: Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pay–Performance Risk List */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-foreground">Pay–Performance Misalignment</h3>
            {/* Legend tooltip */}
            <div className="relative group">
              <button className="p-1 rounded-md hover:bg-muted/60 transition-colors">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <div className="absolute right-0 top-7 z-50 w-72 p-3 rounded-xl border-2 border-border shadow-2xl text-xs opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150" style={{ background: 'hsl(var(--background))' }}>
                <p className="font-semibold text-foreground mb-2.5">How employees are classified</p>
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-sm leading-none">🔴</span>
                    <div>
                      <p className="font-semibold text-foreground">Underpaid Star</p>
                      <p className="text-muted-foreground mt-0.5">Rating ≥ 4.0 and compa-ratio &lt; 95%</p>
                      <p className="text-red-600 dark:text-red-400 mt-0.5 font-medium">Retention risk — act immediately</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-sm leading-none">🟡</span>
                    <div>
                      <p className="font-semibold text-foreground">Overpaid / Low Perf</p>
                      <p className="text-muted-foreground mt-0.5">Rating &lt; 2.5 and compa-ratio &gt; 105%</p>
                      <p className="text-amber-600 dark:text-amber-400 mt-0.5 font-medium">Budget drain — PIP candidate</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Employees where compensation does not reflect their performance rating</p>
          {compVsPerf.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center">
              <div className="h-full w-full bg-muted/30 rounded animate-pulse" />
            </div>
          ) : riskRows.length > 0 ? (
            <div>
              {/* Column headers */}
              <div className="flex items-center gap-2 px-2 pb-2 border-b border-border">
                <span className="flex-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Employee</span>
                <span className="w-9 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Band</span>
                <span className="w-12 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Rating</span>
                <span className="w-12 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Compa</span>
                <span className="w-36 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Risk</span>
              </div>
              <div className="space-y-0.5 mt-1 max-h-[190px] overflow-y-auto">
                {riskRows.map((row: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{row.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{row.department}</p>
                    </div>
                    <span className="w-9 text-center text-[10px] font-bold px-1 py-0.5 rounded bg-primary/10 text-primary">{row.band}</span>
                    <span className="w-12 text-right text-xs font-medium text-foreground tabular-nums">
                      {Number(row.performanceRating).toFixed(1)}
                    </span>
                    <span className={cn(
                      'w-12 text-right text-xs font-bold tabular-nums',
                      row.compaRatio < 85 ? 'text-red-600 dark:text-red-400'
                        : row.compaRatio < 95 ? 'text-amber-600 dark:text-amber-400'
                        : row.compaRatio > 115 ? 'text-orange-500 dark:text-orange-400'
                        : 'text-muted-foreground'
                    )}>
                      {Number(row.compaRatio).toFixed(0)}%
                    </span>
                    <div className="w-36 flex justify-end">
                      <span className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap',
                        row.riskLabel === 'Underpaid Star'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      )}>
                        {row.riskLabel === 'Underpaid Star' ? '🔴 Underpaid Star' : '🟡 Overpaid / Low Perf'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[220px] flex flex-col items-center justify-center gap-2">
              <Scale className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No significant pay–performance misalignments found</p>
            </div>
          )}
        </div>

        {/* Dept Pay Equity Heatmap */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">Department Pay Equity</h3>
          <p className="text-xs text-muted-foreground mb-4">Avg fixed pay by gender across departments</p>
          {deptHeatmap.length > 0 ? (
            <div className="overflow-y-auto max-h-56 space-y-2 pr-1">
              {deptHeatmap.slice(0, 8).map((dept: any) => {
                const gap = Math.abs(dept.gapPercent ?? 0);
                const barColor = gap > 20 ? 'bg-red-500' : gap > 10 ? 'bg-amber-500' : 'bg-green-500';
                return (
                  <div key={dept.department}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-medium text-foreground truncate max-w-[140px]">{dept.department}</span>
                      <span className={cn('text-xs font-bold', gap > 20 ? 'text-red-600' : gap > 10 ? 'text-amber-600' : 'text-green-600')}>
                        {gap.toFixed(1)}% gap
                      </span>
                    </div>
                    <div className="flex gap-1 h-3">
                      <div className="flex-1 bg-muted/40 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${Math.min(gap * 2.5, 100)}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>♂ ₹{(dept.maleAvg / 100000).toFixed(1)}L</span>
                      <span>♀ ₹{(dept.femaleAvg / 100000).toFixed(1)}L</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center">
              <div className="h-40 w-full bg-muted/30 rounded animate-pulse" />
            </div>
          )}
        </div>
      </div>

      </div>{/* end space-y-6 */}
    </div>
  );
}
