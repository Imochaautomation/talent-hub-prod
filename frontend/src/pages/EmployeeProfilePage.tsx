import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Info,
  Star,
  Briefcase,
  DollarSign,
  TrendingUp,
  Award,
  Gift,
} from 'lucide-react';
import { employeeService } from '../services/employee.service';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import {
  cn,
  formatINR,
  getInitials,
  getBandColor,
  formatDate,
  getTenureMonths,
} from '../lib/utils';

// ─── Tooltip ──────────────────────────────────────────────────
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group inline-flex items-center">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[220px] rounded-lg bg-popover border border-border text-popover-foreground text-xs px-2.5 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 text-center whitespace-pre-wrap">
        {text}
      </span>
    </span>
  );
}

// ─── Employment Status Badge ───────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    INACTIVE: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    ON_LEAVE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    TERMINATED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  const label: Record<string, string> = {
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    ON_LEAVE: 'On Leave',
    TERMINATED: 'Terminated',
  };
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', colorMap[status] || 'bg-gray-100 text-gray-600')}>
      {label[status] || status}
    </span>
  );
}

// ─── Benefit Status Badge ──────────────────────────────────────
function BenefitStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    EXPIRED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    CLAIMED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', colorMap[status] || 'bg-gray-100 text-gray-600')}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

// ─── Performance Rating Badge ──────────────────────────────────
function RatingBadge({ rating }: { rating: number | string }) {
  const color =
    Number(rating) >= 4 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : Number(rating) >= 3 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', color)}>
      <Star className="w-3 h-3" />
      {Number(rating).toFixed(1)}
    </span>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Detail Row ────────────────────────────────────────────────
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm text-foreground font-medium">{value != null && value !== '' ? value : <span className="text-muted-foreground/60">—</span>}</p>
    </div>
  );
}

// ─── Tab Button ────────────────────────────────────────────────
function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ─── Compa Ratio Color ─────────────────────────────────────────
function getCompaRatioClass(ratio: number): string {
  if (ratio < 80) return 'text-red-600 dark:text-red-400';
  if (ratio > 120) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

// ─── Salary History Bar Chart ──────────────────────────────────
function SalaryHistoryChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No salary history available.</p>;
  const maxVal = Math.max(...data.map(h => h.value));
  return (
    <div className="flex items-end gap-4 pt-2">
      {data.map(h => {
        const height = Math.max(20, Math.round((h.value / maxVal) * 60));
        return (
          <div key={h.label} className="flex flex-col items-center gap-1.5">
            <p className="text-xs font-medium text-foreground">{formatINR(h.value, true)}</p>
            <div
              className="w-12 rounded-t-md bg-primary/70"
              style={{ height: `${height}px` }}
            />
            <p className="text-[10px] text-muted-foreground whitespace-nowrap">{h.label}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────
export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'identity' | 'compensation' | 'performance' | 'benefits'>('identity');

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.employees.detail(id!),
    queryFn: () => employeeService.getById(id!),
    staleTime: STALE_TIMES.SHORT,
    enabled: !!id,
  });

  const emp = data?.data;

  // ── Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error / Not Found ──────────────────────────────────────
  if (isError || !emp) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted-foreground text-sm">Employee not found or failed to load.</p>
        <button
          onClick={() => navigate('/job-architecture')}
          className="text-sm text-primary underline underline-offset-2"
        >
          Back to Job Architecture
        </button>
      </div>
    );
  }

  // ── Derived Values ─────────────────────────────────────────
  const initials = getInitials(emp.firstName, emp.lastName);
  const bandColorClass = getBandColor(emp.band);
  const annualFixed = Number(emp.annualFixed);
  const variablePay = Number(emp.variablePay);
  const annualCtc = Number(emp.annualCtc);
  const compaRatio = emp.compaRatio != null ? Number(emp.compaRatio) : null;
  const payRangePenetration = emp.payRangePenetration != null ? Number(emp.payRangePenetration) : null;
  const timeInGrade = emp.timeInCurrentGrade != null ? Number(emp.timeInCurrentGrade) : getTenureMonths(emp.dateOfJoining);
  const variablePct = annualFixed > 0 ? ((variablePay / annualFixed) * 100).toFixed(1) : '0.0';

  // Salary history — skip nulls
  const salaryHistoryEntries: { label: string; value: number }[] = [
    { label: 'Apr 2023', value: emp.april2023 ?? null },
    { label: 'Jul 2023', value: emp.july2023 ?? null },
    { label: 'Apr 2024', value: emp.april2024 ?? null },
    { label: 'Jul 2024', value: emp.july2024 ?? null },
  ]
    .filter((e): e is { label: string; value: number | string } => e.value != null && Number(e.value) > 0)
    .map(e => ({ label: e.label, value: Number(e.value) }));

  // DOJ formatted as "05 Mar 2020"
  const dojFormatted = formatDate(emp.dateOfJoining, { day: '2-digit', month: 'short', year: 'numeric' });

  // Reporting manager name
  const managerName = emp.reportingManager
    ? `${emp.reportingManager.firstName} ${emp.reportingManager.lastName}`
    : null;

  // ── RSU vested % calc ──────────────────────────────────────
  const today = new Date();

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/job-architecture')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Job Architecture
      </button>

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div
            className={cn(
              'w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shrink-0',
              bandColorClass
            )}
          >
            {initials}
          </div>

          {/* Name + Meta */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-foreground">
                {emp.firstName} {emp.lastName}
              </h1>
              <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', bandColorClass)}>
                {emp.band}
              </span>
              <StatusBadge status={emp.employmentStatus} />
            </div>
            <p className="text-sm text-muted-foreground">
              {emp.designation} &middot; {emp.department}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">ID: {emp.employeeId}</p>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <TabButton
          active={activeTab === 'identity'}
          onClick={() => setActiveTab('identity')}
          icon={Briefcase}
          label="Identity"
        />
        <TabButton
          active={activeTab === 'compensation'}
          onClick={() => setActiveTab('compensation')}
          icon={DollarSign}
          label="Compensation"
        />
        <TabButton
          active={activeTab === 'performance'}
          onClick={() => setActiveTab('performance')}
          icon={TrendingUp}
          label="Performance"
        />
        <TabButton
          active={activeTab === 'benefits'}
          onClick={() => setActiveTab('benefits')}
          icon={Gift}
          label="Benefits & RSU"
        />
      </div>

      {/* ── Tab: Identity ───────────────────────────────────── */}
      {activeTab === 'identity' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Personal & Employment Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <DetailRow label="Email" value={emp.email} />
              <DetailRow
                label="Gender"
                value={
                  emp.gender === 'PREFER_NOT_TO_SAY'
                    ? 'Prefer not to say'
                    : emp.gender
                    ? emp.gender.charAt(0) + emp.gender.slice(1).toLowerCase().replace('_', ' ')
                    : null
                }
              />
              <DetailRow label="Date of Joining" value={dojFormatted} />
              <DetailRow
                label="Employment Type"
                value={emp.employmentType ? emp.employmentType.replace('_', ' ') : null}
              />
              <DetailRow
                label="Work Mode"
                value={emp.workMode ? emp.workMode.replace('_', ' ') : null}
              />
              <DetailRow label="Work Location" value={emp.workLocation} />
              <DetailRow label="Cost Center" value={emp.costCenter} />
              <DetailRow label="Grade" value={emp.grade} />
              <DetailRow label="Reporting Manager" value={managerName} />
            </div>
          </div>

          {/* Skills */}
          {emp.skills && emp.skills.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4">Skills</h2>
              <div className="flex flex-wrap gap-2">
                {emp.skills.map(es => (
                  <span
                    key={es.skillId}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border"
                  >
                    {es.skill?.name ?? es.skillId}
                    {es.proficiencyLevel && (
                      <span className="text-[10px] opacity-70">· {es.proficiencyLevel}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Compensation ────────────────────────────────── */}
      {activeTab === 'compensation' && (
        <div className="space-y-6">
          {/* Top 3 stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Annual Fixed"
              value={formatINR(annualFixed, true)}
            />
            <StatCard
              label="Variable Pay"
              value={formatINR(variablePay, true)}
              sub={`${variablePct}% of fixed`}
            />
            <StatCard
              label="Annual CTC"
              value={formatINR(annualCtc, true)}
            />
          </div>

          {/* Derived Metrics */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Derived Metrics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* Compa-Ratio */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Compa-Ratio
                  <Tooltip text="(Annual Fixed ÷ Band Midpoint) × 100">
                    <Info className="w-3.5 h-3.5 text-muted-foreground/60 cursor-help" />
                  </Tooltip>
                </div>
                {compaRatio != null ? (
                  <p className={cn('text-2xl font-bold', getCompaRatioClass(compaRatio))}>
                    {compaRatio.toFixed(1)}%
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>

              {/* Pay Range Penetration */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Pay Range Penetration
                  <Tooltip text="((Annual Fixed − Band Min) ÷ (Band Max − Band Min)) × 100">
                    <Info className="w-3.5 h-3.5 text-muted-foreground/60 cursor-help" />
                  </Tooltip>
                </div>
                {payRangePenetration != null ? (
                  <p className="text-2xl font-bold text-foreground">{payRangePenetration.toFixed(1)}%</p>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>

              {/* Time in Grade */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Time in Grade
                  <Tooltip text="Months in current compensation grade (since Date of Joining)">
                    <Info className="w-3.5 h-3.5 text-muted-foreground/60 cursor-help" />
                  </Tooltip>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {timeInGrade} mo
                </p>
              </div>
            </div>
          </div>

          {/* Salary Breakdown Table */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Salary Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Component</th>
                    <th className="text-right py-2 pr-4 text-xs text-muted-foreground font-medium">Annual</th>
                    <th className="text-right py-2 text-xs text-muted-foreground font-medium">Monthly</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    { label: 'Basic', annual: emp.basicAnnual, monthly: emp.basicMonthly },
                    { label: 'HRA', annual: emp.hra, monthly: emp.hraMonthly },
                    { label: 'LTA', annual: emp.lta, monthly: emp.ltaMonthly },
                    { label: 'PF (Employee)', annual: emp.pfYearly, monthly: emp.pfMonthly },
                    { label: 'Special Allowance', annual: emp.specialAllowance, monthly: emp.monthlySpecialAllowance },
                  ].map(row => (
                    <tr key={row.label}>
                      <td className="py-2.5 pr-4 text-foreground font-medium">{row.label}</td>
                      <td className="py-2.5 pr-4 text-right text-foreground tabular-nums">
                        {row.annual != null ? formatINR(Number(row.annual)) : '—'}
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground tabular-nums">
                        {row.monthly != null ? formatINR(Number(row.monthly)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td className="py-2.5 pr-4 text-foreground font-semibold">Monthly Gross</td>
                    <td className="py-2.5 pr-4" />
                    <td className="py-2.5 text-right font-semibold text-foreground tabular-nums">
                      {formatINR(Number(emp.monthlyGrossSalary))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Salary History Chart */}
          {salaryHistoryEntries.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4">Salary History</h2>
              <SalaryHistoryChart data={salaryHistoryEntries} />
              {emp.lastIncrementDate && (
                <p className="text-xs text-muted-foreground mt-4">
                  Last increment: {formatDate(emp.lastIncrementDate, { day: '2-digit', month: 'short', year: 'numeric' })}
                  {emp.lastIncrementPercent != null && (
                    <span className="ml-2 text-green-600 dark:text-green-400 font-medium">
                      +{Number(emp.lastIncrementPercent).toFixed(1)}%
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Performance ────────────────────────────────── */}
      {activeTab === 'performance' && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Performance Ratings</h2>
          {emp.performanceRatings && emp.performanceRatings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Cycle</th>
                    <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Rating</th>
                    <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Label</th>
                    <th className="text-left py-2 text-xs text-muted-foreground font-medium">Reviewer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {emp.performanceRatings.map(pr => (
                    <tr key={pr.id}>
                      <td className="py-3 pr-4 text-foreground font-medium">{pr.cycle}</td>
                      <td className="py-3 pr-4">
                        <RatingBadge rating={pr.rating} />
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {pr.ratingLabel ?? '—'}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {pr.reviewedBy ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Award className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No performance ratings recorded.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Benefits & RSU ──────────────────────────────── */}
      {activeTab === 'benefits' && (
        <div className="space-y-6">
          {/* Active Benefits */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Active Benefits</h2>
            {emp.benefits && emp.benefits.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Benefit</th>
                      <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Category</th>
                      <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Enrolled</th>
                      <th className="text-left py-2 text-xs text-muted-foreground font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {emp.benefits.map(b => (
                      <tr key={b.id}>
                        <td className="py-3 pr-4 text-foreground font-medium">
                          {b.benefit?.name ?? '—'}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {b.benefit?.category
                            ? b.benefit.category.charAt(0) + b.benefit.category.slice(1).toLowerCase()
                            : '—'}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {b.enrolledAt
                            ? formatDate(b.enrolledAt, { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="py-3">
                          <BenefitStatusBadge status={b.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Gift className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No active benefits enrolled.</p>
              </div>
            )}
          </div>

          {/* RSU Grants */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">RSU Grants</h2>
            {emp.rsuGrants && emp.rsuGrants.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Grant Date</th>
                      <th className="text-right py-2 pr-4 text-xs text-muted-foreground font-medium">Total Units</th>
                      <th className="text-right py-2 pr-4 text-xs text-muted-foreground font-medium">Vested %</th>
                      <th className="text-right py-2 text-xs text-muted-foreground font-medium">Grant Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {emp.rsuGrants.map(g => {
                      const vestedUnits =
                        g.vestingEvents
                          ?.filter(v => new Date(v.vestingDate) <= today)
                          .reduce((s, v) => s + Number(v.unitsVesting), 0) ?? 0;
                      const vestedPct =
                        g.totalUnits > 0
                          ? ((vestedUnits / Number(g.totalUnits)) * 100).toFixed(0)
                          : '0';
                      return (
                        <tr key={g.id}>
                          <td className="py-3 pr-4 text-foreground font-medium">
                            {formatDate(g.grantDate, { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="py-3 pr-4 text-right text-foreground tabular-nums">
                            {Number(g.totalUnits).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <span
                              className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                                Number(vestedPct) >= 75
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : Number(vestedPct) >= 25
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                              )}
                            >
                              {vestedPct}%
                            </span>
                          </td>
                          <td className="py-3 text-right text-foreground tabular-nums">
                            {g.priceAtGrant != null && g.totalUnits > 0
                              ? formatINR(Number(g.priceAtGrant) * Number(g.totalUnits), true)
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <TrendingUp className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No RSU grants found for this employee.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
