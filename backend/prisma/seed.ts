import {
  PrismaClient,
  UserRole,
  Gender,
  WorkMode,
  EmploymentType,
  EmploymentStatus,
  BenefitCategory,
  BenefitStatus,
  RsuStatus,
  CommissionPlanType,
  ScenarioStatus,
  NotificationType,
  NotificationSeverity,
  Criticality,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean up in reverse dependency order
  await prisma.aiInsight.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.scenario.deleteMany();
  await prisma.commissionAchievement.deleteMany();
  await prisma.commissionPlan.deleteMany();
  await prisma.rsuVestingEvent.deleteMany();
  await prisma.rsuGrant.deleteMany();
  await prisma.employeeBenefit.deleteMany();
  await prisma.benefitsCatalog.deleteMany();
  await prisma.performanceRating.deleteMany();
  await prisma.marketBenchmark.deleteMany();
  await prisma.salaryBand.deleteMany();
  await prisma.employeeSkill.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.jobCode.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.band.deleteMany();
  await prisma.jobFamily.deleteMany();
  await prisma.jobArea.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.userInvite.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // ─── Admin User ────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.create({
    data: { email: 'vijuadmin@imocha.io', password: adminPassword, name: 'Alex Johnson', role: UserRole.ADMIN },
  });
  console.log('✅ Admin user created');

  // ─── Job Areas ────────────────────────────────────────────────────────────
  const eng = await prisma.jobArea.create({ data: { name: 'Engineering', description: 'Software development, infrastructure, and data engineering' } });
  const sales = await prisma.jobArea.create({ data: { name: 'Sales', description: 'Revenue generation and account management' } });
  const ops = await prisma.jobArea.create({ data: { name: 'Operations', description: 'Business operations and process management' } });
  const hr = await prisma.jobArea.create({ data: { name: 'HR', description: 'Human resources and people management' } });
  const finance = await prisma.jobArea.create({ data: { name: 'Finance', description: 'Financial planning and accounting' } });
  const product = await prisma.jobArea.create({ data: { name: 'Product', description: 'Product management and strategy' } });
  console.log('✅ Job areas created');

  // ─── Job Families ─────────────────────────────────────────────────────────
  const jfBackend = await prisma.jobFamily.create({ data: { name: 'Backend Engineering', jobAreaId: eng.id } });
  const jfFrontend = await prisma.jobFamily.create({ data: { name: 'Frontend Engineering', jobAreaId: eng.id } });
  const jfData = await prisma.jobFamily.create({ data: { name: 'Data Engineering & ML', jobAreaId: eng.id } });
  const jfAE = await prisma.jobFamily.create({ data: { name: 'Account Executive', jobAreaId: sales.id } });
  const jfSDR = await prisma.jobFamily.create({ data: { name: 'Sales Development', jobAreaId: sales.id } });
  const jfBizOps = await prisma.jobFamily.create({ data: { name: 'Business Operations', jobAreaId: ops.id } });
  const jfTA = await prisma.jobFamily.create({ data: { name: 'Talent Acquisition', jobAreaId: hr.id } });
  const jfHRBP = await prisma.jobFamily.create({ data: { name: 'HR Business Partner', jobAreaId: hr.id } });
  const jfFP = await prisma.jobFamily.create({ data: { name: 'Financial Planning & Analysis', jobAreaId: finance.id } });
  const jfPM = await prisma.jobFamily.create({ data: { name: 'Product Management', jobAreaId: product.id } });
  console.log('✅ Job families created');

  // ─── Bands ────────────────────────────────────────────────────────────────
  const bandA1 = await prisma.band.create({ data: { code: 'A1', label: 'Associate',           level: 1,  isEligibleForRSU: false } });
  const bandA2 = await prisma.band.create({ data: { code: 'A2', label: 'Senior Associate',    level: 2,  isEligibleForRSU: false } });
  const bandP1 = await prisma.band.create({ data: { code: 'P1', label: 'Professional',        level: 3,  isEligibleForRSU: false } });
  const bandP2 = await prisma.band.create({ data: { code: 'P2', label: 'Senior Professional', level: 4,  isEligibleForRSU: true  } });
  const bandP3 = await prisma.band.create({ data: { code: 'P3', label: 'Lead',                level: 5,  isEligibleForRSU: true  } });
  const bandM1 = await prisma.band.create({ data: { code: 'M1', label: 'Manager I',           level: 6,  isEligibleForRSU: true  } });
  const bandM2 = await prisma.band.create({ data: { code: 'M2', label: 'Manager II',          level: 7,  isEligibleForRSU: true  } });
  const bandD0 = await prisma.band.create({ data: { code: 'D0', label: 'Director I',          level: 8,  isEligibleForRSU: true  } });
  const bandD1 = await prisma.band.create({ data: { code: 'D1', label: 'Director II',         level: 9,  isEligibleForRSU: true  } });
  const bandD2 = await prisma.band.create({ data: { code: 'D2', label: 'VP / C-Suite',        level: 10, isEligibleForRSU: true  } });
  console.log('✅ Bands created');

  // ─── Grades ───────────────────────────────────────────────────────────────
  await prisma.grade.createMany({
    data: [
      { bandId: bandA1.id, gradeCode: 'A1-1', description: 'Entry Level' },
      { bandId: bandA2.id, gradeCode: 'A2-1', description: 'Junior' },
      { bandId: bandA2.id, gradeCode: 'A2-2', description: 'Junior II' },
      { bandId: bandP1.id, gradeCode: 'P1-1', description: 'Mid-Level' },
      { bandId: bandP1.id, gradeCode: 'P1-2', description: 'Mid-Level II' },
      { bandId: bandP2.id, gradeCode: 'P2-1', description: 'Senior' },
      { bandId: bandP2.id, gradeCode: 'P2-2', description: 'Senior II' },
      { bandId: bandP3.id, gradeCode: 'P3-1', description: 'Lead' },
      { bandId: bandP3.id, gradeCode: 'P3-2', description: 'Staff' },
      { bandId: bandM1.id, gradeCode: 'M1-1', description: 'Manager I' },
      { bandId: bandM2.id, gradeCode: 'M2-1', description: 'Manager II' },
      { bandId: bandD0.id, gradeCode: 'D0-1', description: 'Director I' },
      { bandId: bandD1.id, gradeCode: 'D1-1', description: 'Director II' },
      { bandId: bandD2.id, gradeCode: 'D2-1', description: 'VP / C-Suite' },
    ],
  });
  const grades = await prisma.grade.findMany();
  const gMap = Object.fromEntries(grades.map(g => [g.gradeCode, g]));
  console.log('✅ Grades created');

  // ─── Job Codes ────────────────────────────────────────────────────────────
  const jcSDE1 = await prisma.jobCode.create({ data: { code: 'T-BE-A2', title: 'Software Engineer I', jobFamilyId: jfBackend.id, bandId: bandA2.id, gradeId: gMap['A2-1'].id } });
  const jcSDE2 = await prisma.jobCode.create({ data: { code: 'T-BE-P1', title: 'Software Engineer II', jobFamilyId: jfBackend.id, bandId: bandP1.id, gradeId: gMap['P1-1'].id } });
  const jcSSDE = await prisma.jobCode.create({ data: { code: 'T-BE-P2', title: 'Senior Software Engineer', jobFamilyId: jfBackend.id, bandId: bandP2.id, gradeId: gMap['P2-1'].id } });
  const jcStaff = await prisma.jobCode.create({ data: { code: 'T-BE-P3', title: 'Staff Engineer', jobFamilyId: jfBackend.id, bandId: bandP3.id, gradeId: gMap['P3-2'].id } });
  const jcEngM1 = await prisma.jobCode.create({ data: { code: 'T-BE-M1', title: 'Engineering Manager', jobFamilyId: jfBackend.id, bandId: bandM1.id, gradeId: gMap['M1-1'].id } });
  const jcEngM2 = await prisma.jobCode.create({ data: { code: 'T-BE-M2', title: 'Senior Engineering Manager', jobFamilyId: jfBackend.id, bandId: bandM2.id, gradeId: gMap['M2-1'].id } });
  const jcFE1 = await prisma.jobCode.create({ data: { code: 'T-FE-P1', title: 'Frontend Engineer', jobFamilyId: jfFrontend.id, bandId: bandP1.id, gradeId: gMap['P1-1'].id } });
  const jcFE2 = await prisma.jobCode.create({ data: { code: 'T-FE-P2', title: 'Senior Frontend Engineer', jobFamilyId: jfFrontend.id, bandId: bandP2.id, gradeId: gMap['P2-1'].id } });
  const jcMLE = await prisma.jobCode.create({ data: { code: 'T-ML-P2', title: 'ML Engineer', jobFamilyId: jfData.id, bandId: bandP2.id, gradeId: gMap['P2-2'].id } });
  const jcDE = await prisma.jobCode.create({ data: { code: 'T-DE-P1', title: 'Data Engineer', jobFamilyId: jfData.id, bandId: bandP1.id, gradeId: gMap['P1-2'].id } });
  const jcAE1 = await prisma.jobCode.create({ data: { code: 'S-AE-P1', title: 'Account Executive', jobFamilyId: jfAE.id, bandId: bandP1.id, gradeId: gMap['P1-1'].id } });
  const jcSAE = await prisma.jobCode.create({ data: { code: 'S-AE-P2', title: 'Senior Account Executive', jobFamilyId: jfAE.id, bandId: bandP2.id, gradeId: gMap['P2-1'].id } });
  const jcSDR1 = await prisma.jobCode.create({ data: { code: 'S-SDR-A2', title: 'SDR', jobFamilyId: jfSDR.id, bandId: bandA2.id, gradeId: gMap['A2-2'].id } });
  const jcBizOps = await prisma.jobCode.create({ data: { code: 'O-BO-P1', title: 'Business Analyst', jobFamilyId: jfBizOps.id, bandId: bandP1.id, gradeId: gMap['P1-1'].id } });
  const jcTA1 = await prisma.jobCode.create({ data: { code: 'H-TA-P1', title: 'Technical Recruiter', jobFamilyId: jfTA.id, bandId: bandP1.id, gradeId: gMap['P1-1'].id } });
  const jcHRBP1 = await prisma.jobCode.create({ data: { code: 'H-BP-P2', title: 'HR Business Partner', jobFamilyId: jfHRBP.id, bandId: bandP2.id, gradeId: gMap['P2-1'].id } });
  const jcFPA = await prisma.jobCode.create({ data: { code: 'F-FP-P2', title: 'Financial Analyst', jobFamilyId: jfFP.id, bandId: bandP2.id, gradeId: gMap['P2-1'].id } });
  const jcPM1 = await prisma.jobCode.create({ data: { code: 'P-PM-P2', title: 'Product Manager', jobFamilyId: jfPM.id, bandId: bandP2.id, gradeId: gMap['P2-1'].id } });
  const jcSPM = await prisma.jobCode.create({ data: { code: 'P-PM-P3', title: 'Senior Product Manager', jobFamilyId: jfPM.id, bandId: bandP3.id, gradeId: gMap['P3-1'].id } });
  console.log('✅ Job codes created');

  // ─── Skills ───────────────────────────────────────────────────────────────
  await prisma.skill.createMany({
    data: [
      { name: 'Machine Learning', category: 'Technical', premiumMultiplier: 1.25 },
      { name: 'React', category: 'Technical', premiumMultiplier: 1.10 },
      { name: 'Kubernetes', category: 'DevOps', premiumMultiplier: 1.20 },
      { name: 'AWS', category: 'Cloud', premiumMultiplier: 1.18 },
      { name: 'Python', category: 'Technical', premiumMultiplier: 1.12 },
      { name: 'TypeScript', category: 'Technical', premiumMultiplier: 1.08 },
      { name: 'Salesforce CRM', category: 'Sales', premiumMultiplier: 1.15 },
      { name: 'Data Science', category: 'Analytics', premiumMultiplier: 1.22 },
      { name: 'Product Strategy', category: 'Product', premiumMultiplier: 1.14 },
      { name: 'Financial Modeling', category: 'Finance', premiumMultiplier: 1.10 },
      { name: 'Go Lang', category: 'Technical', premiumMultiplier: 1.18 },
      { name: 'GraphQL', category: 'Technical', premiumMultiplier: 1.09 },
    ],
  });
  console.log('✅ Skills created');

  // ─── Salary Bands ─────────────────────────────────────────────────────────
  const now = new Date();
  const sbData = [
    { bandId: bandA1.id, jobAreaId: null,    min:  300000, mid:  450000, max:   600000 },
    { bandId: bandA2.id, jobAreaId: eng.id,  min:  600000, mid:  800000, max: 1000000 },
    { bandId: bandP1.id, jobAreaId: eng.id, min: 900000, mid: 1200000, max: 1500000 },
    { bandId: bandP2.id, jobAreaId: eng.id, min: 1400000, mid: 1900000, max: 2400000 },
    { bandId: bandP3.id, jobAreaId: eng.id, min: 2200000, mid: 3000000, max: 3800000 },
    { bandId: bandM1.id, jobAreaId: eng.id, min:  3500000, mid:  4500000, max:  5500000 },
    { bandId: bandM2.id, jobAreaId: eng.id, min:  5000000, mid:  6500000, max:  8000000 },
    { bandId: bandD0.id, jobAreaId: null,   min:  5500000, mid:  7000000, max:  9000000 },
    { bandId: bandD1.id, jobAreaId: null,   min:  8000000, mid: 10000000, max: 12500000 },
    { bandId: bandD2.id, jobAreaId: null,   min: 11000000, mid: 14000000, max: 18000000 },
    { bandId: bandA2.id, jobAreaId: sales.id, min: 400000, mid: 600000, max: 800000 },
    { bandId: bandP1.id, jobAreaId: sales.id, min: 700000, mid: 950000, max: 1200000 },
    { bandId: bandP2.id, jobAreaId: sales.id, min: 1100000, mid: 1500000, max: 1900000 },
    { bandId: bandP1.id, jobAreaId: hr.id, min: 600000, mid: 850000, max: 1100000 },
    { bandId: bandP2.id, jobAreaId: hr.id, min: 900000, mid: 1300000, max: 1700000 },
    { bandId: bandP2.id, jobAreaId: finance.id, min: 1000000, mid: 1400000, max: 1800000 },
    { bandId: bandP2.id, jobAreaId: product.id, min: 1500000, mid: 2000000, max: 2500000 },
    { bandId: bandP3.id, jobAreaId: product.id, min: 2400000, mid: 3200000, max: 4000000 },
    { bandId: bandP1.id, jobAreaId: ops.id, min: 600000, mid: 850000, max: 1100000 },
  ];

  const createdSBs = [];
  for (const sb of sbData) {
    const created = await prisma.salaryBand.create({
      data: { bandId: sb.bandId, jobAreaId: sb.jobAreaId, effectiveDate: now, minSalary: sb.min, midSalary: sb.mid, maxSalary: sb.max, currency: 'INR' },
    });
    createdSBs.push({ ...created, min: sb.min, mid: sb.mid, max: sb.max });
    await prisma.marketBenchmark.create({
      data: {
        bandId: sb.bandId, jobCodeId: null, location: 'Bangalore',
        p25: Math.round(sb.min * 0.9), p50: Math.round(sb.mid * 0.95), p75: Math.round(sb.mid * 1.05), p90: Math.round(sb.max * 1.05),
        source: 'Mercer 2024', asOfDate: new Date('2024-01-01'),
      },
    });
  }
  console.log('✅ Salary bands and benchmarks created');

  // ─── Employee helper ───────────────────────────────────────────────────────
  type EmpDef = { fn: string; ln: string; dept: string; desig: string; band: string; gradeCode: string; jobAreaId: string; jcId: string; gender: Gender; sal: number; join: Date; loc: string; mode: WorkMode; crit: Criticality };

  const makeEmp = async (e: EmpDef, idx: number) => {
    const basic = Math.round(e.sal * 0.35);
    const hra = Math.round(e.sal * 0.20);
    const pf = Math.round(basic * 0.12);
    const lta = Math.round(e.sal * 0.05);
    const special = e.sal - basic - hra - pf - lta;
    return prisma.employee.create({
      data: {
        employeeId: `EMP${String(idx + 1001).padStart(4, '0')}`,
        firstName: e.fn, lastName: e.ln,
        email: `${e.fn.toLowerCase()}.${e.ln.toLowerCase()}@company.com`,
        department: e.dept, designation: e.desig, band: e.band, grade: e.gradeCode,
        jobCodeId: e.jcId, gender: e.gender,
        dateOfJoining: e.join, employmentType: EmploymentType.FULL_TIME,
        employmentStatus: EmploymentStatus.ACTIVE,
        workLocation: e.loc, workMode: e.mode, costCenter: `CC-${e.dept.substring(0, 3).toUpperCase()}`,
        annualFixed: e.sal, basicAnnual: basic, hra, pfYearly: pf, lta, specialAllowance: special, annualCtc: e.sal,
        april2023: Math.round(e.sal * 0.85), july2023: Math.round(e.sal * 0.88),
        april2024: Math.round(e.sal * 0.93), july2024: e.sal,
        lastIncrementDate: new Date('2024-07-01'), lastIncrementPercent: 8.5,
        criticality: e.crit,
        addedBy: admin.id,
      },
    });
  };

  const E = eng.id, S = sales.id, O = ops.id, H = hr.id, F = finance.id, P = product.id;
  const C1 = Criticality.C1, C2 = Criticality.C2, C3 = Criticality.C3, C4 = Criticality.C4;
  const empDefs: EmpDef[] = [
    // ── Engineering M1/M2 (3, formerly P4) ──
    { fn:'Vikram', ln:'Sharma', dept:'Engineering', desig:'Engineering Manager', band:'M1', jobAreaId:E, jcId:jcEngM1.id, gradeCode:'M1-1', gender:Gender.MALE, sal:4800000, join:new Date('2019-03-15'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C1 },
    { fn:'Priya', ln:'Nair', dept:'Engineering', desig:'Engineering Manager', band:'M1', jobAreaId:E, jcId:jcEngM1.id, gradeCode:'M1-1', gender:Gender.FEMALE, sal:4200000, join:new Date('2019-08-20'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C1 },
    { fn:'Arjun', ln:'Mehta', dept:'Engineering', desig:'Senior Engineering Manager', band:'M2', jobAreaId:E, jcId:jcEngM2.id, gradeCode:'M2-1', gender:Gender.MALE, sal:5200000, join:new Date('2018-01-10'), loc:'Bangalore', mode:WorkMode.ONSITE, crit:C1 },
    // ── Engineering P3 (4) ──
    { fn:'Kavya', ln:'Reddy', dept:'Engineering', desig:'Staff Engineer', band:'P3', jobAreaId:E, jcId:jcStaff.id, gradeCode:'P3-2', gender:Gender.FEMALE, sal:3200000, join:new Date('2020-06-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C1 },
    { fn:'Rahul', ln:'Gupta', dept:'Engineering', desig:'Staff Engineer', band:'P3', jobAreaId:E, jcId:jcStaff.id, gradeCode:'P3-2', gender:Gender.MALE, sal:3600000, join:new Date('2020-02-15'), loc:'Bangalore', mode:WorkMode.REMOTE, crit:C2 },
    { fn:'Sneha', ln:'Patel', dept:'Engineering', desig:'Lead Engineer', band:'P3', jobAreaId:E, jcId:jcStaff.id, gradeCode:'P3-1', gender:Gender.FEMALE, sal:2500000, join:new Date('2021-04-01'), loc:'Hyderabad', mode:WorkMode.HYBRID, crit:C2 },
    { fn:'Kiran', ln:'Rao', dept:'Engineering', desig:'Lead Engineer', band:'P3', jobAreaId:E, jcId:jcStaff.id, gradeCode:'P3-1', gender:Gender.MALE, sal:3100000, join:new Date('2020-09-01'), loc:'Bangalore', mode:WorkMode.ONSITE, crit:C3 },
    // ── Engineering P2 (9 — includes gender gap + 1 deliberately below band min) ──
    { fn:'Aditya', ln:'Kumar', dept:'Engineering', desig:'Senior Software Engineer', band:'P2', jobAreaId:E, jcId:jcSSDE.id, gradeCode:'P2-1', gender:Gender.MALE, sal:2100000, join:new Date('2021-07-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C2 },
    { fn:'Divya', ln:'Singh', dept:'Engineering', desig:'Senior Software Engineer', band:'P2', jobAreaId:E, jcId:jcSSDE.id, gradeCode:'P2-1', gender:Gender.FEMALE, sal:1600000, join:new Date('2021-05-15'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C1 },
    { fn:'Suresh', ln:'Iyer', dept:'Engineering', desig:'Senior ML Engineer', band:'P2', jobAreaId:E, jcId:jcMLE.id, gradeCode:'P2-2', gender:Gender.MALE, sal:2300000, join:new Date('2021-01-20'), loc:'Bangalore', mode:WorkMode.REMOTE, crit:C1 },
    { fn:'Ananya', ln:'Krishnan', dept:'Engineering', desig:'Senior ML Engineer', band:'P2', jobAreaId:E, jcId:jcMLE.id, gradeCode:'P2-2', gender:Gender.FEMALE, sal:1750000, join:new Date('2021-03-10'), loc:'Bangalore', mode:WorkMode.REMOTE, crit:C1 },
    { fn:'Manoj', ln:'Tiwari', dept:'Engineering', desig:'Senior Frontend Engineer', band:'P2', jobAreaId:E, jcId:jcFE2.id, gradeCode:'P2-1', gender:Gender.MALE, sal:1950000, join:new Date('2022-01-10'), loc:'Mumbai', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Pooja', ln:'Agarwal', dept:'Engineering', desig:'Senior Frontend Engineer', band:'P2', jobAreaId:E, jcId:jcFE2.id, gradeCode:'P2-1', gender:Gender.FEMALE, sal:1500000, join:new Date('2022-03-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C2 },
    { fn:'Nitin', ln:'Joshi', dept:'Engineering', desig:'Senior Software Engineer', band:'P2', jobAreaId:E, jcId:jcSSDE.id, gradeCode:'P2-2', gender:Gender.MALE, sal:2400000, join:new Date('2020-11-01'), loc:'Hyderabad', mode:WorkMode.ONSITE, crit:C4 },
    { fn:'Ritu', ln:'Sharma', dept:'Engineering', desig:'Senior Software Engineer', band:'P2', jobAreaId:E, jcId:jcSSDE.id, gradeCode:'P2-1', gender:Gender.FEMALE, sal:1200000, join:new Date('2023-02-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C3 },
    // BELOW BAND MIN (P2 Eng min=1400000) — pay anomaly for demo
    { fn:'Tarun', ln:'Bose', dept:'Engineering', desig:'Senior Software Engineer', band:'P2', jobAreaId:E, jcId:jcSSDE.id, gradeCode:'P2-1', gender:Gender.MALE, sal:1100000, join:new Date('2023-11-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C3 },
    // ── Engineering P1 (6) ──
    { fn:'Deepak', ln:'Verma', dept:'Engineering', desig:'Software Engineer II', band:'P1', jobAreaId:E, jcId:jcSDE2.id, gradeCode:'P1-1', gender:Gender.MALE, sal:1300000, join:new Date('2022-07-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Lakshmi', ln:'Balaji', dept:'Engineering', desig:'Software Engineer II', band:'P1', jobAreaId:E, jcId:jcSDE2.id, gradeCode:'P1-1', gender:Gender.FEMALE, sal:1000000, join:new Date('2022-09-15'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Rohit', ln:'Das', dept:'Engineering', desig:'Data Engineer', band:'P1', jobAreaId:E, jcId:jcDE.id, gradeCode:'P1-2', gender:Gender.MALE, sal:1400000, join:new Date('2022-04-01'), loc:'Bangalore', mode:WorkMode.REMOTE, crit:C2 },
    { fn:'Shreya', ln:'Mishra', dept:'Engineering', desig:'Frontend Engineer', band:'P1', jobAreaId:E, jcId:jcFE1.id, gradeCode:'P1-1', gender:Gender.FEMALE, sal:950000, join:new Date('2023-01-15'), loc:'Pune', mode:WorkMode.HYBRID, crit:C4 },
    { fn:'Abhishek', ln:'Sinha', dept:'Engineering', desig:'Software Engineer II', band:'P1', jobAreaId:E, jcId:jcSDE2.id, gradeCode:'P1-2', gender:Gender.MALE, sal:1250000, join:new Date('2023-03-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Priyanka', ln:'Nanda', dept:'Engineering', desig:'Data Engineer', band:'P1', jobAreaId:E, jcId:jcDE.id, gradeCode:'P1-1', gender:Gender.FEMALE, sal:880000, join:new Date('2023-06-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C4 },
    // ── Engineering A2 (3) ──
    { fn:'Amit', ln:'Pandey', dept:'Engineering', desig:'Software Engineer I', band:'A2', jobAreaId:E, jcId:jcSDE1.id, gradeCode:'A2-1', gender:Gender.MALE, sal:750000, join:new Date('2023-07-01'), loc:'Bangalore', mode:WorkMode.ONSITE, crit:C4 },
    { fn:'Neha', ln:'Jain', dept:'Engineering', desig:'Software Engineer I', band:'A2', jobAreaId:E, jcId:jcSDE1.id, gradeCode:'A2-1', gender:Gender.FEMALE, sal:650000, join:new Date('2023-08-15'), loc:'Bangalore', mode:WorkMode.ONSITE, crit:C4 },
    { fn:'Gaurav', ln:'Malik', dept:'Engineering', desig:'Software Engineer I', band:'A2', jobAreaId:E, jcId:jcSDE1.id, gradeCode:'A2-1', gender:Gender.MALE, sal:820000, join:new Date('2023-06-15'), loc:'Hyderabad', mode:WorkMode.ONSITE, crit:C3 },

    // ── Sales (12) ──
    { fn:'Rajiv', ln:'Khanna', dept:'Sales', desig:'Senior Account Executive', band:'P2', jobAreaId:S, jcId:jcSAE.id, gradeCode:'P2-1', gender:Gender.MALE, sal:1600000, join:new Date('2020-03-01'), loc:'Mumbai', mode:WorkMode.HYBRID, crit:C1 },
    { fn:'Simran', ln:'Kaur', dept:'Sales', desig:'Senior Account Executive', band:'P2', jobAreaId:S, jcId:jcSAE.id, gradeCode:'P2-1', gender:Gender.FEMALE, sal:1300000, join:new Date('2020-06-15'), loc:'Delhi', mode:WorkMode.HYBRID, crit:C2 },
    { fn:'Varun', ln:'Ahuja', dept:'Sales', desig:'Account Executive', band:'P1', jobAreaId:S, jcId:jcAE1.id, gradeCode:'P1-1', gender:Gender.MALE, sal:1050000, join:new Date('2021-08-01'), loc:'Mumbai', mode:WorkMode.ONSITE, crit:C2 },
    { fn:'Meera', ln:'Bhat', dept:'Sales', desig:'Account Executive', band:'P1', jobAreaId:S, jcId:jcAE1.id, gradeCode:'P1-1', gender:Gender.FEMALE, sal:800000, join:new Date('2022-01-10'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C4 },
    { fn:'Sanjay', ln:'Pillai', dept:'Sales', desig:'Account Executive', band:'P1', jobAreaId:S, jcId:jcAE1.id, gradeCode:'P1-1', gender:Gender.MALE, sal:950000, join:new Date('2021-10-01'), loc:'Chennai', mode:WorkMode.ONSITE, crit:C3 },
    { fn:'Isha', ln:'Bansal', dept:'Sales', desig:'SDR', band:'A2', jobAreaId:S, jcId:jcSDR1.id, gradeCode:'A2-2', gender:Gender.FEMALE, sal:550000, join:new Date('2023-04-01'), loc:'Delhi', mode:WorkMode.HYBRID, crit:C4 },
    { fn:'Pranav', ln:'Sethi', dept:'Sales', desig:'SDR', band:'A2', jobAreaId:S, jcId:jcSDR1.id, gradeCode:'A2-2', gender:Gender.MALE, sal:620000, join:new Date('2023-03-15'), loc:'Mumbai', mode:WorkMode.HYBRID, crit:C4 },
    { fn:'Kritika', ln:'Kapoor', dept:'Sales', desig:'Senior Account Executive', band:'P2', jobAreaId:S, jcId:jcSAE.id, gradeCode:'P2-2', gender:Gender.FEMALE, sal:1450000, join:new Date('2020-12-01'), loc:'Mumbai', mode:WorkMode.HYBRID, crit:C2 },
    { fn:'Sachin', ln:'Ghosh', dept:'Sales', desig:'Senior Account Executive', band:'P2', jobAreaId:S, jcId:jcSAE.id, gradeCode:'P2-2', gender:Gender.MALE, sal:1800000, join:new Date('2019-11-01'), loc:'Mumbai', mode:WorkMode.HYBRID, crit:C2 },
    // BELOW BAND MIN — pay anomaly
    { fn:'Manish', ln:'Rastogi', dept:'Sales', desig:'Senior Account Executive', band:'P2', jobAreaId:S, jcId:jcSAE.id, gradeCode:'P2-1', gender:Gender.MALE, sal:950000, join:new Date('2024-01-15'), loc:'Delhi', mode:WorkMode.HYBRID, crit:C4 },
    { fn:'Radha', ln:'Venkat', dept:'Sales', desig:'Account Executive', band:'P1', jobAreaId:S, jcId:jcAE1.id, gradeCode:'P1-1', gender:Gender.FEMALE, sal:870000, join:new Date('2022-08-01'), loc:'Hyderabad', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Kunal', ln:'Desai', dept:'Sales', desig:'SDR', band:'A2', jobAreaId:S, jcId:jcSDR1.id, gradeCode:'A2-2', gender:Gender.MALE, sal:580000, join:new Date('2023-10-01'), loc:'Mumbai', mode:WorkMode.ONSITE, crit:C4 },

    // ── Product (9) ──
    { fn:'Neeraj', ln:'Oberoi', dept:'Product', desig:'Senior Product Manager', band:'P3', jobAreaId:P, jcId:jcSPM.id, gradeCode:'P3-1', gender:Gender.MALE, sal:3400000, join:new Date('2019-06-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C1 },
    { fn:'Tanvi', ln:'Bhosale', dept:'Product', desig:'Senior Product Manager', band:'P3', jobAreaId:P, jcId:jcSPM.id, gradeCode:'P3-1', gender:Gender.FEMALE, sal:2800000, join:new Date('2020-02-01'), loc:'Mumbai', mode:WorkMode.HYBRID, crit:C2 },
    { fn:'Rohan', ln:'Choudhary', dept:'Product', desig:'Senior PM', band:'P3', jobAreaId:P, jcId:jcSPM.id, gradeCode:'P3-2', gender:Gender.MALE, sal:3600000, join:new Date('2019-04-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C1 },
    { fn:'Harish', ln:'Saxena', dept:'Product', desig:'Product Manager', band:'P2', jobAreaId:P, jcId:jcPM1.id, gradeCode:'P2-1', gender:Gender.MALE, sal:2200000, join:new Date('2021-03-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C2 },
    { fn:'Pallavi', ln:'Menon', dept:'Product', desig:'Product Manager', band:'P2', jobAreaId:P, jcId:jcPM1.id, gradeCode:'P2-1', gender:Gender.FEMALE, sal:1900000, join:new Date('2021-07-15'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Shivam', ln:'Goyal', dept:'Product', desig:'Product Manager', band:'P2', jobAreaId:P, jcId:jcPM1.id, gradeCode:'P2-2', gender:Gender.MALE, sal:2400000, join:new Date('2020-10-01'), loc:'Hyderabad', mode:WorkMode.HYBRID, crit:C2 },
    { fn:'Aparna', ln:'Nambiar', dept:'Product', desig:'Product Manager', band:'P2', jobAreaId:P, jcId:jcPM1.id, gradeCode:'P2-1', gender:Gender.FEMALE, sal:1700000, join:new Date('2022-02-01'), loc:'Bangalore', mode:WorkMode.REMOTE, crit:C3 },
    { fn:'Dhruv', ln:'Thakur', dept:'Product', desig:'Product Manager', band:'P2', jobAreaId:P, jcId:jcPM1.id, gradeCode:'P2-1', gender:Gender.MALE, sal:2100000, join:new Date('2022-04-15'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C3 },
    // ABOVE BAND MAX (P2 Product max=2500000) — pay anomaly
    { fn:'Sunita', ln:'Rawat', dept:'Product', desig:'Product Manager', band:'P2', jobAreaId:P, jcId:jcPM1.id, gradeCode:'P2-2', gender:Gender.FEMALE, sal:2900000, join:new Date('2021-01-01'), loc:'Delhi', mode:WorkMode.REMOTE, crit:C4 },

    // ── HR (8) ──
    { fn:'Archana', ln:'Dubey', dept:'HR', desig:'HR Business Partner', band:'P2', jobAreaId:H, jcId:jcHRBP1.id, gradeCode:'P2-1', gender:Gender.FEMALE, sal:1400000, join:new Date('2020-08-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Ramesh', ln:'Nair', dept:'HR', desig:'HR Business Partner', band:'P2', jobAreaId:H, jcId:jcHRBP1.id, gradeCode:'P2-1', gender:Gender.MALE, sal:1600000, join:new Date('2019-12-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C2 },
    { fn:'Jayanti', ln:'Kulkarni', dept:'HR', desig:'Technical Recruiter', band:'P1', jobAreaId:H, jcId:jcTA1.id, gradeCode:'P1-1', gender:Gender.FEMALE, sal:750000, join:new Date('2022-01-15'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C4 },
    { fn:'Santosh', ln:'Kadam', dept:'HR', desig:'Technical Recruiter', band:'P1', jobAreaId:H, jcId:jcTA1.id, gradeCode:'P1-1', gender:Gender.MALE, sal:900000, join:new Date('2021-06-01'), loc:'Mumbai', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Harsha', ln:'Rao', dept:'HR', desig:'Technical Recruiter', band:'P1', jobAreaId:H, jcId:jcTA1.id, gradeCode:'P1-2', gender:Gender.FEMALE, sal:800000, join:new Date('2022-11-01'), loc:'Hyderabad', mode:WorkMode.HYBRID, crit:C4 },
    { fn:'Girish', ln:'Patil', dept:'HR', desig:'Senior HR Business Partner', band:'P2', jobAreaId:H, jcId:jcHRBP1.id, gradeCode:'P2-2', gender:Gender.MALE, sal:1750000, join:new Date('2020-01-15'), loc:'Pune', mode:WorkMode.ONSITE, crit:C2 },
    { fn:'Seema', ln:'Tripathi', dept:'HR', desig:'HR Business Partner', band:'P2', jobAreaId:H, jcId:jcHRBP1.id, gradeCode:'P2-1', gender:Gender.FEMALE, sal:1100000, join:new Date('2022-06-01'), loc:'Delhi', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Mukesh', ln:'Soni', dept:'HR', desig:'Technical Recruiter', band:'P1', jobAreaId:H, jcId:jcTA1.id, gradeCode:'P1-1', gender:Gender.MALE, sal:700000, join:new Date('2023-04-01'), loc:'Bangalore', mode:WorkMode.ONSITE, crit:C4 },

    // ── Finance (7) ──
    { fn:'Chetan', ln:'Shah', dept:'Finance', desig:'Senior Financial Analyst', band:'P2', jobAreaId:F, jcId:jcFPA.id, gradeCode:'P2-2', gender:Gender.MALE, sal:1600000, join:new Date('2020-05-01'), loc:'Mumbai', mode:WorkMode.ONSITE, crit:C2 },
    { fn:'Ranjana', ln:'Pillai', dept:'Finance', desig:'Financial Analyst', band:'P2', jobAreaId:F, jcId:jcFPA.id, gradeCode:'P2-1', gender:Gender.FEMALE, sal:1200000, join:new Date('2021-03-15'), loc:'Mumbai', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Mithun', ln:'Roy', dept:'Finance', desig:'Financial Analyst', band:'P2', jobAreaId:F, jcId:jcFPA.id, gradeCode:'P2-1', gender:Gender.MALE, sal:1450000, join:new Date('2020-10-15'), loc:'Kolkata', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Usha', ln:'Krishnamurthy', dept:'Finance', desig:'Financial Analyst', band:'P2', jobAreaId:F, jcId:jcFPA.id, gradeCode:'P2-1', gender:Gender.FEMALE, sal:1100000, join:new Date('2022-02-01'), loc:'Chennai', mode:WorkMode.HYBRID, crit:C4 },
    { fn:'Prakash', ln:'Iyer', dept:'Finance', desig:'Senior Financial Analyst', band:'P2', jobAreaId:F, jcId:jcFPA.id, gradeCode:'P2-2', gender:Gender.MALE, sal:1700000, join:new Date('2019-09-01'), loc:'Mumbai', mode:WorkMode.ONSITE, crit:C1 },
    { fn:'Sunanda', ln:'Bhattacharya', dept:'Finance', desig:'Financial Analyst', band:'P2', jobAreaId:F, jcId:jcFPA.id, gradeCode:'P2-1', gender:Gender.FEMALE, sal:1300000, join:new Date('2021-08-01'), loc:'Mumbai', mode:WorkMode.HYBRID, crit:C3 },
    // BELOW BAND MIN Finance P2 (min=1000000) — pay anomaly
    { fn:'Alok', ln:'Chatterjee', dept:'Finance', desig:'Financial Analyst', band:'P2', jobAreaId:F, jcId:jcFPA.id, gradeCode:'P2-1', gender:Gender.MALE, sal:850000, join:new Date('2024-02-01'), loc:'Kolkata', mode:WorkMode.HYBRID, crit:C4 },

    // ── Operations (10) ──
    { fn:'Pradeep', ln:'Nair', dept:'Operations', desig:'Business Analyst', band:'P1', jobAreaId:O, jcId:jcBizOps.id, gradeCode:'P1-1', gender:Gender.MALE, sal:900000, join:new Date('2021-09-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Swati', ln:'Lad', dept:'Operations', desig:'Business Analyst', band:'P1', jobAreaId:O, jcId:jcBizOps.id, gradeCode:'P1-1', gender:Gender.FEMALE, sal:750000, join:new Date('2022-04-01'), loc:'Pune', mode:WorkMode.HYBRID, crit:C4 },
    { fn:'Ganesh', ln:'Hegde', dept:'Operations', desig:'Senior Business Analyst', band:'P1', jobAreaId:O, jcId:jcBizOps.id, gradeCode:'P1-2', gender:Gender.MALE, sal:1050000, join:new Date('2020-07-01'), loc:'Bangalore', mode:WorkMode.ONSITE, crit:C2 },
    { fn:'Roshni', ln:'Naik', dept:'Operations', desig:'Business Analyst', band:'P1', jobAreaId:O, jcId:jcBizOps.id, gradeCode:'P1-1', gender:Gender.FEMALE, sal:700000, join:new Date('2022-08-01'), loc:'Goa', mode:WorkMode.REMOTE, crit:C4 },
    { fn:'Umesh', ln:'Joshi', dept:'Operations', desig:'Business Analyst', band:'P1', jobAreaId:O, jcId:jcBizOps.id, gradeCode:'P1-1', gender:Gender.MALE, sal:820000, join:new Date('2022-02-15'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Savita', ln:'Deshpande', dept:'Operations', desig:'Business Analyst', band:'P1', jobAreaId:O, jcId:jcBizOps.id, gradeCode:'P1-1', gender:Gender.FEMALE, sal:680000, join:new Date('2023-01-01'), loc:'Pune', mode:WorkMode.HYBRID, crit:C4 },
    { fn:'Nilesh', ln:'Pawar', dept:'Operations', desig:'Senior Business Analyst', band:'P1', jobAreaId:O, jcId:jcBizOps.id, gradeCode:'P1-2', gender:Gender.MALE, sal:1100000, join:new Date('2020-03-01'), loc:'Nashik', mode:WorkMode.ONSITE, crit:C3 },
    { fn:'Varsha', ln:'Gawde', dept:'Operations', desig:'Business Analyst', band:'P1', jobAreaId:O, jcId:jcBizOps.id, gradeCode:'P1-1', gender:Gender.FEMALE, sal:720000, join:new Date('2023-05-01'), loc:'Pune', mode:WorkMode.HYBRID, crit:C4 },
    { fn:'Hemant', ln:'Thakkar', dept:'Operations', desig:'Business Analyst', band:'P1', jobAreaId:O, jcId:jcBizOps.id, gradeCode:'P1-1', gender:Gender.MALE, sal:870000, join:new Date('2022-10-01'), loc:'Ahmedabad', mode:WorkMode.HYBRID, crit:C3 },
    { fn:'Madhuri', ln:'Kale', dept:'Operations', desig:'Business Analyst', band:'P1', jobAreaId:O, jcId:jcBizOps.id, gradeCode:'P1-1', gender:Gender.FEMALE, sal:760000, join:new Date('2023-02-01'), loc:'Bangalore', mode:WorkMode.HYBRID, crit:C4 },
  ];

  const employees: any[] = [];
  for (let i = 0; i < empDefs.length; i++) {
    const emp = await makeEmp(empDefs[i], i);
    employees.push(emp);
  }
  console.log(`✅ ${employees.length} employees created`);

  // ─── Performance Ratings ───────────────────────────────────────────────────
  const ratingMap: Record<string, { h1: number; h2: number }> = {
    'vikram.sharma@company.com': { h1: 4.5, h2: 4.6 },
    'priya.nair@company.com': { h1: 4.1, h2: 4.3 },
    'arjun.mehta@company.com': { h1: 3.8, h2: 4.2 },
    'kavya.reddy@company.com': { h1: 4.3, h2: 4.5 },
    'rahul.gupta@company.com': { h1: 3.9, h2: 4.0 },
    'sneha.patel@company.com': { h1: 4.0, h2: 3.8 },
    'kiran.rao@company.com': { h1: 3.5, h2: 3.7 },
    'aditya.kumar@company.com': { h1: 4.2, h2: 4.4 },
    'divya.singh@company.com': { h1: 4.8, h2: 4.7 },     // Star — high perf, below band
    'suresh.iyer@company.com': { h1: 4.7, h2: 4.8 },
    'ananya.krishnan@company.com': { h1: 4.6, h2: 4.5 }, // Star — high perf, below band
    'manoj.tiwari@company.com': { h1: 3.6, h2: 3.5 },
    'pooja.agarwal@company.com': { h1: 4.5, h2: 4.4 },   // Star — high perf, below band
    'nitin.joshi@company.com': { h1: 2.8, h2: 2.5 },     // Under — low perf, high pay
    'ritu.sharma@company.com': { h1: 3.8, h2: 4.0 },
    'deepak.verma@company.com': { h1: 4.0, h2: 4.1 },
    'rohit.das@company.com': { h1: 4.2, h2: 4.3 },
    'abhishek.sinha@company.com': { h1: 3.7, h2: 3.8 },
    'rajiv.khanna@company.com': { h1: 4.8, h2: 4.9 },
    'simran.kaur@company.com': { h1: 4.3, h2: 4.4 },
    'varun.ahuja@company.com': { h1: 4.6, h2: 4.5 },
    'kritika.kapoor@company.com': { h1: 4.1, h2: 4.2 },
    'sachin.ghosh@company.com': { h1: 4.4, h2: 4.3 },
    'neeraj.oberoi@company.com': { h1: 4.7, h2: 4.8 },
    'rohan.choudhary@company.com': { h1: 4.5, h2: 4.6 },
    'harish.saxena@company.com': { h1: 4.3, h2: 4.2 },
    'shivam.goyal@company.com': { h1: 4.2, h2: 4.4 },
    'ramesh.nair@company.com': { h1: 4.0, h2: 4.1 },
    'girish.patil@company.com': { h1: 4.2, h2: 4.3 },
    'chetan.shah@company.com': { h1: 4.4, h2: 4.5 },
    'mithun.roy@company.com': { h1: 4.1, h2: 4.0 },
    'prakash.iyer@company.com': { h1: 4.5, h2: 4.6 },
  };

  const rl = (r: number) => r >= 4.5 ? 'Exceptional' : r >= 4.0 ? 'Exceeds Expectations' : r >= 3.5 ? 'Meets Expectations' : r >= 3.0 ? 'Below Expectations' : 'Needs Improvement';

  for (const emp of employees) {
    const ratings = ratingMap[emp.email];
    if (ratings) {
      await prisma.performanceRating.createMany({
        data: [
          { employeeId: emp.id, cycle: '2024-H1', rating: ratings.h1, ratingLabel: rl(ratings.h1), reviewedBy: admin.id },
          { employeeId: emp.id, cycle: '2024-H2', rating: ratings.h2, ratingLabel: rl(ratings.h2), reviewedBy: admin.id },
        ],
      });
    }
  }
  console.log('✅ Performance ratings created');

  // ─── Benefits ─────────────────────────────────────────────────────────────
  await prisma.benefitsCatalog.createMany({
    data: [
      { name: 'Comprehensive Medical Insurance', category: BenefitCategory.INSURANCE, annualValue: 300000, eligibilityCriteria: { employmentTypes: ['FULL_TIME'] }, isActive: true },
      { name: 'Parental Medical Insurance', category: BenefitCategory.INSURANCE, annualValue: 300000, eligibilityCriteria: { employmentTypes: ['FULL_TIME'] }, isActive: true },
      { name: 'Mental Health on Loop', category: BenefitCategory.WELLNESS, annualValue: 36000, eligibilityCriteria: {}, isActive: true },
      { name: 'RSU Grant', category: BenefitCategory.EQUITY, annualValue: 500000, eligibilityCriteria: { minBandLevel: 4, minTenureMonths: 12, minPerformanceRating: 4.0 }, isActive: true },
      { name: 'Training & Learning Allowance', category: BenefitCategory.LEARNING, annualValue: 25000, eligibilityCriteria: { employmentTypes: ['FULL_TIME'] }, isActive: true },
      { name: 'Paternity Leave', category: BenefitCategory.LEAVE, annualValue: 0, eligibilityCriteria: { genders: ['MALE', 'NON_BINARY'] }, isActive: true },
      { name: 'Bereavement Leave', category: BenefitCategory.LEAVE, annualValue: 0, eligibilityCriteria: {}, isActive: true },
      { name: 'Mochaccino Award', category: BenefitCategory.RECOGNITION, annualValue: 10000, eligibilityCriteria: { minPerformanceRating: 4.5 }, isActive: true },
      { name: 'TuxedoMocha Award', category: BenefitCategory.RECOGNITION, annualValue: 5000, eligibilityCriteria: {}, isActive: true },
      { name: 'Annual Company Offsite', category: BenefitCategory.WELLNESS, annualValue: 15000, eligibilityCriteria: { employmentStatuses: ['ACTIVE'] }, isActive: true },
    ],
  });

  const allBenefits = await prisma.benefitsCatalog.findMany();
  const medBen = allBenefits.find(b => b.name === 'Comprehensive Medical Insurance')!;
  for (let i = 0; i < Math.min(45, employees.length); i++) {
    await prisma.employeeBenefit.create({
      data: { employeeId: employees[i].id, benefitId: medBen.id, enrolledAt: new Date('2024-01-01'), utilizationPercent: Math.floor(Math.random() * 70) + 15, status: BenefitStatus.ACTIVE },
    });
  }
  console.log('✅ Benefits created');

  // ─── RSU Grants ────────────────────────────────────────────────────────────
  const today = new Date();
  const rsuEmps = employees.filter(e => ['P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'].includes(e.band));

  for (const emp of rsuEmps.slice(0, 28)) {
    const grantDate = ['M1','M2','D0','D1','D2'].includes(emp.band) ? new Date('2022-01-01') : emp.band === 'P3' ? new Date('2022-07-01') : new Date('2023-01-01');
    const totalUnits = emp.band === 'M2' ? 2000 : emp.band === 'M1' ? 1200 : emp.band === 'P3' ? 600 : 300;

    const grant = await prisma.rsuGrant.create({
      data: { employeeId: emp.id, grantDate, totalUnits, vestedUnits: 0, vestingScheduleMonths: 48, cliffMonths: 12, vestingPercent: 25, priceAtGrant: 500, currentPrice: 750, status: RsuStatus.ACTIVE },
    });

    for (let i = 0; i < 4; i++) {
      const vestDate = new Date(grantDate);
      vestDate.setMonth(vestDate.getMonth() + (i + 1) * 12);
      const isVested = vestDate <= today;
      await prisma.rsuVestingEvent.create({
        data: { rsuGrantId: grant.id, vestingDate: vestDate, unitsVesting: Math.floor(totalUnits / 4), isVested, vestedAt: isVested ? vestDate : null },
      });
    }
  }

  // 2 vesting events due THIS MONTH for live demo
  const p3Emps = employees.filter(e => e.band === 'P3').slice(0, 2);
  for (const emp of p3Emps) {
    const demoGrant = await prisma.rsuGrant.findFirst({ where: { employeeId: emp.id } });
    if (demoGrant) {
      await prisma.rsuVestingEvent.create({
        data: { rsuGrantId: demoGrant.id, vestingDate: new Date(today.getFullYear(), today.getMonth(), 20), unitsVesting: 150, isVested: false },
      });
    }
  }
  console.log('✅ RSU grants and vesting events created');

  // ─── Commission Plans ─────────────────────────────────────────────────────
  const salesPlan = await prisma.commissionPlan.create({
    data: {
      name: 'Sales Quota Plan 2024', targetVariablePercent: 30, planType: CommissionPlanType.SALES,
      acceleratorTiers: [
        { threshold: 100, multiplier: 1.0, label: 'On Target' },
        { threshold: 110, multiplier: 1.15, label: 'Accelerator I' },
        { threshold: 125, multiplier: 1.30, label: 'Accelerator II' },
        { threshold: 150, multiplier: 1.60, label: 'Club' },
      ],
      effectiveFrom: new Date('2024-01-01'), effectiveTo: new Date('2024-12-31'),
    },
  });

  const salesEmps = employees.filter(e => e.department === 'Sales');
  const achPcts = [142, 118, 95, 107, 88, 125, 135, 97, 73, 115, 103, 89];
  for (let i = 0; i < Math.min(salesEmps.length, achPcts.length); i++) {
    const target = Math.round(Number(salesEmps[i].annualFixed) * (Number(salesPlan.targetVariablePercent) / 100) / 4);
    const achieved = Math.round(target * achPcts[i] / 100);
    const mult = achPcts[i] >= 125 ? 1.30 : achPcts[i] >= 110 ? 1.15 : 1.0;
    await prisma.commissionAchievement.create({
      data: { employeeId: salesEmps[i].id, planId: salesPlan.id, period: '2024-Q3', targetAmount: target, achievedAmount: achieved, achievementPercent: achPcts[i], payoutAmount: Math.round(achieved * mult) },
    });
  }
  console.log('✅ Commission plans created');

  // ─── Scenarios ────────────────────────────────────────────────────────────
  await prisma.scenario.createMany({
    data: [
      { name: '10% Raise for All P2s', description: 'Provide a 10% salary increase to all Senior Professionals (Band P2) to improve retention', createdById: admin.id, rules: [{ filter: { band: 'P2' }, action: { type: 'RAISE_PERCENT', value: 10 } }], status: ScenarioStatus.DRAFT },
      { name: 'Bring Below-Band to Minimum', description: 'Adjust all employees below their band minimum to the minimum salary', createdById: admin.id, rules: [{ filter: { compaRatio: { max: 80 } }, action: { type: 'SET_COMPA_RATIO', value: 80 } }], status: ScenarioStatus.DRAFT },
      { name: 'Engineering Market Alignment', description: 'Align all Engineering employees to market P50 benchmark for their band', createdById: admin.id, rules: [{ filter: { department: 'Engineering' }, action: { type: 'SET_TO_BENCHMARK' } }], status: ScenarioStatus.DRAFT },
      { name: '15% for Top Performers', description: 'Give a 15% raise to all employees with performance rating 4.5 or above', createdById: admin.id, rules: [{ filter: { performanceRating: { min: 4.5 } }, action: { type: 'RAISE_PERCENT', value: 15 } }], status: ScenarioStatus.DRAFT },
    ],
  });
  console.log('✅ Scenarios created');

  // ─── Notifications ────────────────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      { type: NotificationType.PAY_ANOMALY, title: 'Pay Anomaly Detected', message: '5 employees found outside their salary band range. Immediate review recommended.', severity: NotificationSeverity.CRITICAL, isRead: false, relatedEntityType: 'employee' },
      { type: NotificationType.BUDGET_ALERT, title: 'Engineering Budget Alert', message: 'Engineering department has consumed 87% of Q3 compensation budget.', severity: NotificationSeverity.WARNING, isRead: false, relatedEntityType: 'department', metadata: { department: 'Engineering', budgetUsedPercent: 87 } },
      { type: NotificationType.RSU_VESTING, title: 'RSU Vesting Due This Month', message: '2 RSU grants have vesting events scheduled this month totaling 300 units.', severity: NotificationSeverity.INFO, isRead: false, relatedEntityType: 'rsuGrant' },
      { type: NotificationType.GENERAL, title: 'Gender Pay Gap Alert', message: 'Analysis shows an 8.2% gender pay gap in the Engineering department.', severity: NotificationSeverity.WARNING, isRead: false, relatedEntityType: 'payEquity' },
      { type: NotificationType.GENERAL, title: 'Salary Band Review Due', message: 'Annual salary band review is due. Market benchmarks were last updated 6 months ago.', severity: NotificationSeverity.INFO, isRead: true, relatedEntityType: 'salaryBand' },
    ],
  });
  console.log('✅ Notifications created');

  // ─── Pre-generated AI Insights ────────────────────────────────────────────
  await prisma.aiInsight.createMany({
    data: [
      {
        insightType: 'PAY_EQUITY_SCORE',
        title: 'Pay Equity Analysis — Q4 2024',
        narrative: `## Pay Equity Assessment\n\n**Overall Pay Equity Score: 67/100** — Action Required\n\nOur analysis of ${employees.length} employees across 6 departments reveals significant compensation disparities that require immediate attention.\n\n### Key Findings\n\n**Gender Pay Gap:** The most critical issue is the **8.2% gender pay gap** in the Engineering department, where female Senior Software Engineers earn on average ₹3.2L less than their male counterparts in equivalent roles (Band P2). Similar patterns emerge in Product Management (6.1% gap) and Sales (5.8% gap).\n\n**Compa-Ratio Distribution:** Only 62% of employees fall within the healthy 80-120% compa-ratio range. 5 employees are below 80% (at risk of attrition) and 3 are above 120% (representing budget risk).\n\n**Band Compliance:** 5 employees (6.7% of workforce) are currently outside their salary band — 4 below the minimum and 1 above the maximum.\n\n### Recommendations\n\n1. **Immediate Action:** Conduct a targeted pay review for the 8 Engineering female employees in Band P2 and P3. Estimated remediation cost: ₹24-32L annually.\n2. **Structural Fix:** Implement a mandatory quarterly compa-ratio review with a remediation budget of 2-3% of payroll.\n3. **Band Compliance:** Adjust the 4 below-minimum employees to band minimum within the current compensation cycle.\n4. **Monitoring:** Set up automated alerts when any new hire or promotion creates a compa-ratio below 85%.\n5. **Reporting:** Include gender pay gap metrics in the quarterly board compensation report starting Q1 2025.`,
        data: { score: 67, genderGapPercent: 8.2, employeesOutsideBand: 5, compaRatioHealth: 62 },
        filters: {},
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
        model: 'claude-sonnet-4-6',
        promptTokens: 1250,
        completionTokens: 480,
      },
      {
        insightType: 'ATTRITION_RISK',
        title: 'Attrition Risk Analysis — High-Risk Employees',
        narrative: `## Attrition Risk Assessment\n\n**High-Risk Employees Identified: 8** | **Immediate Action Required: 3**\n\nBased on compensation positioning, performance ratings, and tenure analysis, we have identified employees at significant flight risk.\n\n### Critical Risk Group (3 Employees)\n\n- **Divya Singh** (Senior SWE, Band P2) — Compa-ratio 84%, Performance 4.7. ₹4.8L below band median. Estimated replacement cost: ₹18-25L.\n- **Ananya Krishnan** (Senior ML Engineer, Band P2) — Compa-ratio 92%, Performance 4.5. ML talent scarcity makes this critical.\n- **Pooja Agarwal** (Senior Frontend Engineer, Band P2) — Compa-ratio 79%, Performance 4.4. Below band minimum — compliance issue and flight risk.\n\n### Recommended Actions\n\n1. **Immediate salary corrections** for the 3 critical-risk employees: estimated total investment ₹14.4L/year.\n2. **RSU acceleration** as a retention lever — recommend granting an additional 150 units each to Divya Singh and Ananya Krishnan.\n3. **Stay interviews** for all 8 high-risk employees within the next 30 days.\n4. **Promotion pipeline:** Kavya Reddy and Rahul Gupta are overdue for Band P4 elevation based on performance and tenure.`,
        data: { highRiskCount: 8, criticalCount: 3, estimatedReplacementCostInr: 7500000, topRiskEmployees: ['Divya Singh', 'Ananya Krishnan', 'Pooja Agarwal'] },
        filters: {},
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
        model: 'claude-sonnet-4-6',
        promptTokens: 1180,
        completionTokens: 520,
      },
    ],
  });
  console.log('✅ Pre-generated AI insights created');

  console.log('\n🎉 Seed complete!');
  console.log(`   Employees: ${employees.length}`);
  console.log(`   Salary Bands: ${createdSBs.length}`);
  console.log(`   Pay anomalies: 5 (deliberate, for demo)`);
  console.log(`   Gender pay gap: ~8.2% in Engineering`);
  console.log(`   RSU vesting this month: 2 grants`);
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
