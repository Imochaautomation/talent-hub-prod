// ============================================================
// CompSense — Shared TypeScript Types
// Used by both frontend and backend
// ============================================================

// ─── API Response Wrappers ───────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// ─── Auth ────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions?: string[];
  lastLoginAt?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
}

export type UserRole = 'ADMIN' | 'HR_MANAGER' | 'HR_STAFF' | 'VIEWER';

// ─── Job Architecture ─────────────────────────────────────────
export interface JobArea {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  jobFamilies?: JobFamily[];
  _count?: { jobFamilies: number };
}

export interface JobSubFamily {
  id: string;
  name: string;
  jobFamilyId: string;
  jobFamily?: JobFamily;
  createdAt: string;
  updatedAt: string;
  jobCodes?: JobCode[];
  _count?: { jobCodes: number };
}

export interface JobFamily {
  id: string;
  name: string;
  jobAreaId: string;
  jobArea?: JobArea;
  createdAt: string;
  updatedAt: string;
  jobCodes?: JobCode[];
  jobSubFamilies?: JobSubFamily[];
  _count?: { jobCodes: number };
}

export interface Band {
  id: string;
  code: BandCode;
  label: string;
  level: number;
  isEligibleForRSU: boolean;
  createdAt: string;
  updatedAt: string;
  grades?: Grade[];
}

export interface Grade {
  id: string;
  bandId: string;
  band?: Band;
  gradeCode: string;
  description?: string | null;
}

export interface JobCode {
  id: string;
  code: string;
  title: string;
  jobFamilyId: string;
  jobFamily?: JobFamily;
  jobSubFamilyId?: string | null;
  jobSubFamily?: JobSubFamily | null;
  bandId: string;
  band?: Band;
  gradeId?: string | null;
  grade?: Grade | null;
  createdAt: string;
  updatedAt: string;
  _count?: { employees: number };
}

export interface JobHierarchyNode {
  area: JobArea;
  families: {
    family: JobFamily;
    jobCodes: (JobCode & { employeeCount: number })[];
  }[];
}

// ─── Employees ───────────────────────────────────────────────
export interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  nickName?: string | null;
  email: string;
  department: string;
  designation: string;
  reportingManagerId?: string | null;
  reportingManager?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'designation'> | null;
  dateOfJoining: string;
  dateOfExit?: string | null;
  grade: string;
  band: BandCode;
  jobCodeId?: string | null;
  jobCode?: JobCode | null;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  gender: Gender;
  workLocation?: string | null;
  workMode: WorkMode;
  costCenter?: string | null;

  // Annual Compensation — Prisma Decimal fields serialize as strings in JSON;
  // consumers must wrap with Number() before arithmetic or comparison.
  annualFixed: number | string;
  variablePay: number | string;
  specialAllowance: number | string;
  hra: number | string;
  pfYearly: number | string;
  basicAnnual: number | string;
  retentionBonus: number | string;
  annualCtc: number | string;
  joiningBonus: number | string;
  lta: number | string;
  flexiTotalYearly: number | string;
  subTotalA: number | string;
  incentives: number | string;

  // Monthly Compensation
  hraMonthly: number | string;
  pfMonthly: number | string;
  basicMonthly: number | string;
  ltaMonthly: number | string;
  monthlyGrossSalary: number | string;
  flexiTotalMonthly: number | string;
  subTotalAMonthly: number | string;
  monthlySpecialAllowance: number | string;

  // Revision History
  april2023?: number | string | null;
  july2023?: number | string | null;
  april2024?: number | string | null;
  july2024?: number | string | null;
  lastIncrementDate?: string | null;
  lastIncrementPercent?: number | null;

  // Computed Fields
  compaRatio?: number | null;
  payRangePenetration?: number | null;
  attritionRiskScore?: number | null;
  timeInCurrentGrade?: number | null;

  // Meta
  refNo?: string | null;
  remarks?: string | null;
  addedBy?: string | null;
  compensationDocument?: string | null;

  createdAt: string;
  updatedAt: string;

  // Relations (optional, loaded on demand)
  skills?: EmployeeSkill[];
  performanceRatings?: PerformanceRating[];
  benefits?: EmployeeBenefit[];
  rsuGrants?: RsuGrant[];
}

export interface EmployeeSkill {
  employeeId: string;
  skillId: string;
  skill?: Skill;
  proficiencyLevel: ProficiencyLevel;
  certificationName?: string | null;
  certifiedAt?: string | null;
}

export interface Skill {
  id: string;
  name: string;
  category?: string | null;
  premiumMultiplier?: number | null;
  createdAt: string;
  updatedAt: string;
  _count?: { employeeSkills: number };
}

export interface EmployeeAnalyticsSummary {
  totalEmployees: number;
  activeEmployees: number;
  byBand: Record<BandCode, number>;
  byDepartment: Record<string, number>;
  byGender: Record<Gender, number>;
  byWorkMode: Record<WorkMode, number>;
}

// ─── Salary Bands ─────────────────────────────────────────────
export interface SalaryBand {
  id: string;
  bandId: string;
  band?: Band;
  jobAreaId?: string | null;
  jobArea?: JobArea | null;
  effectiveDate: string;
  minSalary: number;
  midSalary: number;
  maxSalary: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketBenchmark {
  id: string;
  bandId?: string | null;
  band?: Band | null;
  jobCodeId?: string | null;
  jobCode?: JobCode | null;
  jobAreaId?: string | null;
  location?: string | null;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  source?: string | null;
  asOfDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryBandOutlier {
  employee: Pick<Employee, 'id' | 'employeeId' | 'firstName' | 'lastName' | 'band' | 'department' | 'annualFixed' | 'compaRatio'>;
  salaryBand: SalaryBand;
  deviation: number;
  deviationType: 'ABOVE' | 'BELOW';
}

// ─── Performance ──────────────────────────────────────────────
export interface PerformanceRating {
  id: string;
  employeeId: string;
  employee?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'band' | 'department'>;
  cycle: string;
  rating: number;
  ratingLabel?: string | null;
  comments?: string | null;
  reviewedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayPerformanceMatrixPoint {
  employee: Pick<Employee, 'id' | 'employeeId' | 'firstName' | 'lastName' | 'band' | 'annualCtc'>;
  performanceRating: number;
  compaRatio: number;
  quadrant: 'STARS' | 'SOLID' | 'UNDER_PERFORMER' | 'OVERPAID';
}

export interface PromotionReadinessEntry {
  employee: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'band' | 'department' | 'timeInCurrentGrade' | 'compaRatio'>;
  latestRating: number;
  readinessScore: number;
  currentBand: BandCode;
  recommendedBand: BandCode;
  flags: string[];
}

// ─── Benefits ─────────────────────────────────────────────────
export interface BenefitsCatalog {
  id: string;
  name: string;
  category: BenefitCategory;
  description?: string | null;
  annualValue?: number | null;
  eligibilityCriteria?: BenefitEligibilityCriteria | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { employeeBenefits: number };
}

export interface BenefitEligibilityCriteria {
  minBandLevel?: number;
  minTenureMonths?: number;
  minPerformanceRating?: number;
  employmentTypes?: EmploymentType[];
  genders?: Gender[];
}

export interface EmployeeBenefit {
  id: string;
  employeeId: string;
  employee?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'band'>;
  benefitId: string;
  benefit?: BenefitsCatalog;
  enrolledAt: string;
  expiresAt?: string | null;
  utilizationPercent?: number | null;
  utilizedValue?: number | null;
  status: BenefitStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── RSU ──────────────────────────────────────────────────────
export interface RsuGrant {
  id: string;
  employeeId: string;
  employee?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'band' | 'annualFixed'>;
  grantDate: string;
  totalUnits: number;
  vestedUnits: number;
  vestingScheduleMonths: number;
  cliffMonths: number;
  vestingPercent: number;
  priceAtGrant?: number | null;
  currentPrice?: number | null;
  status: RsuStatus;
  createdAt: string;
  updatedAt: string;
  vestingEvents?: RsuVestingEvent[];
  currentValue?: number;
  unvestedUnits?: number;
}

export interface RsuVestingEvent {
  id: string;
  rsuGrantId: string;
  vestingDate: string;
  unitsVesting: number;
  isVested: boolean;
  vestedAt?: string | null;
  createdAt: string;
}

export interface RsuSummary {
  totalGranted: number;
  totalVested: number;
  totalForfeited: number;
  vestingThisMonth: number;
  vestingThisQuarter: number;
  totalCurrentValue: number;
  totalEmployeesWithGrants: number;
}

export interface RsuEligibilityEntry {
  employee: Pick<Employee, 'id' | 'employeeId' | 'firstName' | 'lastName' | 'band' | 'department' | 'annualFixed'>;
  latestRating?: number;
  tenureMonths: number;
  qualificationReason: string;
  suggestedGrantUnits?: number;
  suggestedGrantValue?: number;
}

// ─── Variable Pay & Commission ────────────────────────────────
export interface CommissionPlan {
  id: string;
  name: string;
  targetVariablePercent: number;
  acceleratorTiers: AcceleratorTier[];
  planType: CommissionPlanType;
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcceleratorTier {
  threshold: number;
  multiplier: number;
  label?: string;
}

export interface CommissionAchievement {
  id: string;
  employeeId: string;
  employee?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'band' | 'department'>;
  planId: string;
  plan?: CommissionPlan;
  period: string;
  targetAmount: number;
  achievedAmount: number;
  achievementPercent: number;
  payoutAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutCalculationResult {
  targetAmount: number;
  achievedAmount: number;
  achievementPercent: number;
  payoutAmount: number;
  tierApplied: AcceleratorTier;
}

// ─── Scenarios ────────────────────────────────────────────────
export interface Scenario {
  id: string;
  name: string;
  description?: string | null;
  createdById: string;
  createdBy?: AuthUser;
  rules: ScenarioRule[];
  status: ScenarioStatus;
  totalCostImpact?: number | null;
  affectedEmployeeCount?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioRule {
  filter: ScenarioFilter;
  action: ScenarioAction;
}

export interface ScenarioFilter {
  band?: BandCode | BandCode[];
  department?: string | string[];
  performanceRating?: { min: number; max?: number };
  compaRatio?: { min?: number; max?: number };
  gender?: Gender;
  tenureMonths?: { min?: number; max?: number };
}

export interface ScenarioAction {
  type: 'RAISE_PERCENT' | 'RAISE_FLAT' | 'SET_TO_BENCHMARK' | 'SET_COMPA_RATIO';
  value: number;
}

export interface ScenarioRunResult {
  affectedEmployees: ScenarioEmployeeChange[];
  totalCurrentCost: number;
  totalProjectedCost: number;
  costIncrease: number;
  costIncreasePercent: number;
  breakdown: {
    byBand: Record<string, { currentCost: number; projectedCost: number; count: number }>;
    byDepartment: Record<string, { currentCost: number; projectedCost: number; count: number }>;
  };
}

export interface ScenarioEmployeeChange {
  employee: Pick<Employee, 'id' | 'employeeId' | 'firstName' | 'lastName' | 'band' | 'department'>;
  currentCtc: number;
  projectedCtc: number;
  increase: number;
  increasePercent: number;
}

// ─── Pay Equity ───────────────────────────────────────────────
export interface GenderPayGapResult {
  overall: {
    maleMeanCtc: number;
    femaleMeanCtc: number;
    gapPercent: number;
    gapAmount: number;
    employeeCount: { male: number; female: number };
  };
  byDepartment: {
    department: string;
    maleMeanCtc: number;
    femaleMeanCtc: number;
    gapPercent: number;
  }[];
  byBand: {
    band: BandCode;
    maleMeanCtc: number;
    femaleMeanCtc: number;
    gapPercent: number;
  }[];
}

export interface CompaRatioDistribution {
  bins: { range: string; min: number; max: number; count: number; percent: number }[];
  stats: { mean: number; median: number; p25: number; p75: number; stdDev: number };
}

export interface HeatmapCell {
  department: string;
  band: BandCode;
  avgCompaRatio: number;
  employeeCount: number;
}

export interface PayEquityScore {
  overallScore: number;
  genderScore: number;
  tenureScore: number;
  bandScore: number;
  interpretation: string;
  trend?: 'improving' | 'declining' | 'stable';
}

// ─── Dashboard ────────────────────────────────────────────────
export interface DashboardKPIs {
  totalEmployees: number;
  activeEmployees: number;
  totalAnnualCtc: number;
  avgCompaRatio: number;
  employeesOutsideBand: number;
  genderPayGapPercent: number;
  rsuGrantedThisYear: number;
  openNotificationsCount: number;
  salaryBandCoverage: number;
  avgPerformanceRating: number;
  monthlyDelta?: {
    employees: number;
    ctc: number;
  };
}

export interface SalaryDistributionBin {
  range: string;
  minLakh: number;
  maxLakh: number;
  count: number;
  percent: number;
}

export interface CompensationTrendPoint {
  label: string;
  avgCtc: number;
  medianCtc: number;
  cycle: string;
}

// ─── Notifications ────────────────────────────────────────────
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  isRead: boolean;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationSummary {
  unreadCount: number;
  criticalCount: number;
  byType: Record<NotificationType, number>;
}

// ─── AI Insights ──────────────────────────────────────────────
export interface AiInsight {
  id: string;
  insightType: InsightType;
  title: string;
  narrative: string;
  data: Record<string, unknown>;
  filters?: Record<string, unknown> | null;
  generatedAt: string;
  expiresAt?: string | null;
  model: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  createdAt: string;
  isFromCache?: boolean;
}

export interface GenerateInsightRequest {
  insightType: InsightType;
  filters?: Record<string, unknown>;
  forceRefresh?: boolean;
}

// ─── Socket Events ────────────────────────────────────────────
export interface SocketNotificationPayload {
  notification: Notification;
}

export interface SocketPayAnomalyPayload {
  employee: Pick<Employee, 'id' | 'employeeId' | 'firstName' | 'lastName' | 'band' | 'annualCtc'>;
  band: SalaryBand;
  delta: number;
  deviationType: 'ABOVE' | 'BELOW';
}

export interface SocketBudgetThresholdPayload {
  department: string;
  used: number;
  limit: number;
  percentUsed: number;
}

export interface SocketRsuVestingPayload {
  employee: Pick<Employee, 'id' | 'firstName' | 'lastName'>;
  grant: Pick<RsuGrant, 'id' | 'totalUnits'>;
  units: number;
  estimatedValue?: number;
}

// ─── Enums ────────────────────────────────────────────────────
export type BandCode = 'A1' | 'A2' | 'P1' | 'P2' | 'P3' | 'P4' | 'M0' | 'M1' | 'M2' | 'M3' | 'D0' | 'D1' | 'D2' | 'V0' | 'V1' | 'V2' | 'E0' | 'E1' | 'E2';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type Gender = 'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY';
export type WorkMode = 'REMOTE' | 'HYBRID' | 'ONSITE';
export type ProficiencyLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type BenefitCategory = 'INSURANCE' | 'EQUITY' | 'LEARNING' | 'LEAVE' | 'RECOGNITION' | 'WELLNESS';
export type BenefitStatus = 'ACTIVE' | 'EXPIRED' | 'CLAIMED';
export type RsuStatus = 'ACTIVE' | 'FULLY_VESTED' | 'FORFEITED';
export type CommissionPlanType = 'SALES' | 'PERFORMANCE' | 'HYBRID';
export type ScenarioStatus = 'DRAFT' | 'APPLIED' | 'ARCHIVED';
export type NotificationType = 'PAY_ANOMALY' | 'BUDGET_ALERT' | 'NEW_HIRE_PARITY' | 'RSU_VESTING' | 'GENERAL';
export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type InsightType =
  | 'PAY_EQUITY_SCORE'
  | 'ATTRITION_RISK'
  | 'RSU_ALLOCATION'
  | 'TOP_SALARIES'
  | 'COMPA_RATIO_DISTRIBUTION'
  | 'NEW_HIRE_PARITY'
  | 'BENEFITS_UTILIZATION'
  | 'VARIABLE_PAY_ACHIEVEMENT'
  | 'SKILLS_PREMIUM_MAP'
  | 'PROMOTION_READINESS'
  | 'TCOW_BY_DEPT'
  | 'SALARY_GROWTH_TREND'
  | 'COMMISSION_EFFECTIVENESS'
  | 'BUDGET_BURN_RATE'
  | 'CRITICAL_EMPLOYEES';
