import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { Gender, WorkMode, EmploymentType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { BAND_ORDER } from '../types/index';
import { emitEmployeeImportProgress, emitEmployeeImportComplete } from '../lib/socket';
import { cacheDel, cacheDelPattern } from '../lib/redis';
import logger from '../lib/logger';
import { getAiInferredPerformance } from './aiPerformanceInference';

export interface ImportRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  designation: string;
  dateOfJoining: string;
  gender: string;
  band: string;
  grade: string;
  annualFixed: string;
  variablePay?: string;
  annualCtc?: string;
  workMode?: string;
  workLocation?: string;
  employmentType?: string;
  employmentStatus?: string;
  reportingManagerEmail?: string;
  costCenter?: string;
  // Zoho Salary Breakdown
  basicAnnual?: string;
  basicMonthly?: string;
  hra?: string;
  hraMonthly?: string;
  pfYearly?: string;
  pfMonthly?: string;
  lta?: string;
  ltaMonthly?: string;
  specialAllowance?: string;
  monthlySpecialAllowance?: string;
  subTotalA?: string;
  subTotalAMonthly?: string;
  monthlyGrossSalary?: string;
  flexiTotalYearly?: string;
  flexiTotalMonthly?: string;
  retentionBonus?: string;
  joiningBonus?: string;
  incentives?: string;
  // Zoho Revision Cycles (annual fixed salary at each revision point)
  april2023?: string;
  july2023?: string;
  april2024?: string;
  july2024?: string;
  // Zoho Meta
  nickName?: string;
  refNo?: string;
  remarks?: string;
  addedBy?: string;
  compensationDocument?: string;
  presentAddress?: string;
  dateOfExit?: string;
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  imported: number;
  failed: number;
  errors: ImportError[];
  replaced?: boolean;
  detectedColumns?: string[];
}

// ─── Column Alias Map ─────────────────────────────────────────
// Strips spaces/underscores/hyphens, lowercases, then maps to canonical field
const COLUMN_ALIASES: Record<string, keyof ImportRow | 'fullName'> = {
  // employeeId
  employeeid: 'employeeId', empid: 'employeeId', empno: 'employeeId',
  employeeno: 'employeeId', employeenumber: 'employeeId', staffid: 'employeeId',
  staffno: 'employeeId', refno: 'employeeId', associateid: 'employeeId',
  workerid: 'employeeId', id: 'employeeId', employeeidentifier: 'employeeId',

  // name (combined – split later)
  name: 'fullName', fullname: 'fullName', employeename: 'fullName',
  staffname: 'fullName', associatename: 'fullName', workername: 'fullName',
  candidatename: 'fullName', membername: 'fullName',

  // firstName
  firstname: 'firstName', fname: 'firstName', givenname: 'firstName', forename: 'firstName',

  // lastName
  lastname: 'lastName', lname: 'lastName', surname: 'lastName', familyname: 'lastName',

  // email
  email: 'email', emailaddress: 'email', workmail: 'email', officeemail: 'email',
  corporateemail: 'email', officialmail: 'email', companye_mail: 'email',

  // department
  department: 'department', dept: 'department', businessunit: 'department',
  bu: 'department', division: 'department', team: 'department',
  function: 'department', practicearea: 'department', costdepartment: 'department',

  // designation
  designation: 'designation', jobtitle: 'designation', title: 'designation',
  role: 'designation', position: 'designation', jobrole: 'designation',
  currentdesignation: 'designation', jobdesignation: 'designation',
  currentrole: 'designation', jobposition: 'designation',

  // dateOfJoining
  dateofjoining: 'dateOfJoining', doj: 'dateOfJoining', joiningdate: 'dateOfJoining',
  startdate: 'dateOfJoining', hiredate: 'dateOfJoining', dateofhire: 'dateOfJoining',
  doh: 'dateOfJoining', dateofjoin: 'dateOfJoining', joiningdateddmmyyyy: 'dateOfJoining',
  dateofcommencement: 'dateOfJoining',

  // gender
  gender: 'gender', sex: 'gender',

  // band
  band: 'band', payband: 'band', level: 'band', gradelevel: 'band',
  bandlevel: 'band', salarylevel: 'band', joblevel: 'band', careerband: 'band',
  employeeband: 'band', salarband: 'band',

  // grade
  grade: 'grade', paygrade: 'grade', subband: 'grade', jobgrade: 'grade',
  gradecode: 'grade', employeegrade: 'grade',

  // annualFixed
  annualfixed: 'annualFixed', fixedctc: 'annualFixed', basesalary: 'annualFixed',
  annualbase: 'annualFixed', fixedsalary: 'annualFixed', annualfixedsalary: 'annualFixed',
  fixedannual: 'annualFixed', basectc: 'annualFixed', fixedpay: 'annualFixed',
  annualsalary: 'annualFixed', totalfixed: 'annualFixed', annualfixedctc: 'annualFixed',
  grosssalary: 'annualFixed', annualgross: 'annualFixed', fixedcomponent: 'annualFixed',

  // variablePay
  variablepay: 'variablePay', variable: 'variablePay', targetvariable: 'variablePay',
  variablecompensation: 'variablePay', bonustarget: 'variablePay',
  annualvariable: 'variablePay', variablectc: 'variablePay', incentive: 'variablePay',
  annualincentive: 'variablePay', stincentive: 'variablePay', bonus: 'variablePay',

  // annualCtc (ALSO used as annualFixed fallback when annualFixed absent)
  annualctc: 'annualCtc', ctc: 'annualCtc', totalctc: 'annualCtc',
  totalcompensation: 'annualCtc', grossctc: 'annualCtc', totalannualctc: 'annualCtc',
  packagectc: 'annualCtc', totalpackage: 'annualCtc', overallctc: 'annualCtc',
  grossannualctc: 'annualCtc', annualtotalctc: 'annualCtc', compensation: 'annualCtc',

  // workMode
  workmode: 'workMode', workingmode: 'workMode', workarrangement: 'workMode',
  workingarrangement: 'workMode', mode: 'workMode',

  // workLocation
  worklocation: 'workLocation', location: 'workLocation', officelocation: 'workLocation',
  city: 'workLocation', baselocation: 'workLocation', primarylocation: 'workLocation',
  office: 'workLocation', site: 'workLocation', basecity: 'workLocation',

  // employmentType
  employmenttype: 'employmentType', emptype: 'employmentType', contracttype: 'employmentType',
  employeetype: 'employmentType', workertype: 'employmentType', stafftype: 'employmentType',

  // reportingManagerEmail
  reportingmanageremail: 'reportingManagerEmail', manageremail: 'reportingManagerEmail',
  reportstoemail: 'reportingManagerEmail', reportingmanager: 'reportingManagerEmail',
  managersmail: 'reportingManagerEmail', reportsto: 'reportingManagerEmail',

  // costCenter
  costcenter: 'costCenter', cc: 'costCenter', costcentre: 'costCenter',
  costcentrecode: 'costCenter', costcentercode: 'costCenter',

  // ── Zoho People specific ──────────────────────────────────────
  // Revision cycles (Zoho exports salary value at each revision point)
  april2023: 'april2023', apr2023: 'april2023',
  july2023: 'july2023',   jul2023: 'july2023',
  april2024: 'april2024', apr2024: 'april2024',
  july2024: 'july2024',   jul2024: 'july2024',

  // Salary breakdown
  basicannual: 'basicAnnual', annualbasic: 'basicAnnual', basictotal: 'basicAnnual',
  basicmonthly: 'basicMonthly', monthlybasic: 'basicMonthly',
  hra: 'hra', houserentallowance: 'hra',
  hramonthly: 'hraMonthly', monthllyhra: 'hraMonthly',
  pfyearly: 'pfYearly', pfannual: 'pfYearly', providentfundyearly: 'pfYearly',
  pfmonthly: 'pfMonthly', monthlypf: 'pfMonthly', providentfundmonthly: 'pfMonthly',
  lta: 'lta', leavetravel: 'lta', leavetravelallowance: 'lta',
  ltamonthly: 'ltaMonthly', monthlylta: 'ltaMonthly',
  specialallowance: 'specialAllowance', spl: 'specialAllowance',
  monthlyspecialallowance: 'monthlySpecialAllowance',
  subtotala: 'subTotalA', subtotalamonthly: 'subTotalAMonthly',
  monthlygrosssalary: 'monthlyGrossSalary', monthlygross: 'monthlyGrossSalary',
  flexitotalyearly: 'flexiTotalYearly', flexiyearly: 'flexiTotalYearly',
  flexitotalmonthly: 'flexiTotalMonthly', fleximonthly: 'flexiTotalMonthly',
  retentionbonus: 'retentionBonus', retention: 'retentionBonus',
  joiningbonus: 'joiningBonus', joinbonus: 'joiningBonus',
  incentives: 'incentives',

  // Zoho meta columns
  nickname: 'nickName', nicknames: 'nickName',
  refnoyearmonthempno: 'refNo', referenceno: 'refNo',
  cityofresidence: 'workLocation', residencecity: 'workLocation',
  presentaddress: 'presentAddress', address: 'presentAddress',
  compensationdocument: 'compensationDocument',
  addedby: 'addedBy',
  remarks: 'remarks', remark: 'remarks',
  dateofexit: 'dateOfExit', exitdate: 'dateOfExit', dateofleaving: 'dateOfExit',
  employmentstatus: 'employmentStatus',
};

function normKey(raw: string): string {
  return String(raw).toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function normaliseHeaders(rows: Record<string, any>[]): { rows: ImportRow[]; detected: string[] } {
  const detected = rows.length > 0 ? Object.keys(rows[0]) : [];
  const mapped = rows.map((row) => {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      const canonical = COLUMN_ALIASES[normKey(key)];
      if (canonical === 'fullName') {
        // split "Priya Sharma" → firstName + lastName
        const parts = String(val || '').trim().split(/\s+/);
        if (!out['firstName']) out['firstName'] = parts[0] || '';
        if (!out['lastName']) out['lastName'] = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
      } else if (canonical) {
        out[canonical] = val;
      } else {
        out[key] = val; // keep unknown columns too
      }
    }
    return out as ImportRow;
  });
  return { rows: mapped, detected };
}

// ─── Value Normalisers ────────────────────────────────────────
const GENDER_MAP: Record<string, string> = {
  m: 'MALE', male: 'MALE', man: 'MALE',
  f: 'FEMALE', female: 'FEMALE', woman: 'FEMALE',
  nb: 'NON_BINARY', nonbinary: 'NON_BINARY',
  other: 'PREFER_NOT_TO_SAY', prefernotsay: 'PREFER_NOT_TO_SAY', na: 'PREFER_NOT_TO_SAY',
};

const WORKMODE_MAP: Record<string, string> = {
  remote: 'REMOTE', wfh: 'REMOTE', workfromhome: 'REMOTE', home: 'REMOTE', wf: 'REMOTE',
  onsite: 'ONSITE', office: 'ONSITE', wfo: 'ONSITE', inoffice: 'ONSITE',
  hybrid: 'HYBRID', mixed: 'HYBRID', partial: 'HYBRID',
};

const EMPTYPE_MAP: Record<string, string> = {
  fulltime: 'FULL_TIME', ft: 'FULL_TIME', permanent: 'FULL_TIME', regular: 'FULL_TIME',
  parttime: 'PART_TIME', pt: 'PART_TIME',
  contract: 'CONTRACT', contractor: 'CONTRACT', consultant: 'CONTRACT', temp: 'CONTRACT', temporary: 'CONTRACT',
  intern: 'INTERN', internship: 'INTERN', trainee: 'INTERN', apprentice: 'INTERN',
};

const VALID_BANDS: readonly string[] = BAND_ORDER;
const VALID_GENDERS = ['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'];

// Parse salary strings like "12,00,000" / "12.5L" / "12.5 Lakhs" / "1200000"
function parseSalary(val: any): number {
  if (!val) return 0;
  const str = String(val).replace(/[\s,]/g, '').toLowerCase();
  const lakh = str.match(/^([\d.]+)\s*l(?:akh)?s?$/i);
  if (lakh) return parseFloat(lakh[1]) * 100000;
  const k = str.match(/^([\d.]+)k$/i);
  if (k) return parseFloat(k[1]) * 1000;
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

// Parse any date format → YYYY-MM-DD
function parseDate(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel date serial
    try {
      const info = XLSX.SSF.parse_date_code(val);
      if (info) return `${info.y}-${String(info.m).padStart(2,'0')}-${String(info.d).padStart(2,'0')}`;
    } catch {}
  }
  const str = String(val).trim();
  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    // if first part > 12 it's definitely day
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // YYYY-MM-DD or YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return str;
}

function normaliseValues(row: ImportRow): ImportRow {
  const r = { ...row } as any;
  if (r.gender) r.gender = GENDER_MAP[normKey(r.gender)] || r.gender.toUpperCase();
  if (r.workMode) r.workMode = WORKMODE_MAP[normKey(r.workMode)] || r.workMode.toUpperCase();
  if (r.employmentType) r.employmentType = EMPTYPE_MAP[normKey(r.employmentType)] || r.employmentType.toUpperCase();
  if (r.band) r.band = r.band.toString().toUpperCase().trim();
  if (r.dateOfJoining) r.dateOfJoining = parseDate(r.dateOfJoining);
  // Salary fields
  const SALARY_FIELDS = [
    'annualFixed','variablePay','annualCtc',
    'basicAnnual','basicMonthly','hra','hraMonthly','pfYearly','pfMonthly',
    'lta','ltaMonthly','specialAllowance','monthlySpecialAllowance',
    'subTotalA','subTotalAMonthly','monthlyGrossSalary',
    'flexiTotalYearly','flexiTotalMonthly','retentionBonus','joiningBonus','incentives',
    'april2023','july2023','april2024','july2024',
  ];
  for (const field of SALARY_FIELDS) {
    if (r[field]) {
      const parsed = parseSalary(r[field]);
      r[field] = parsed > 0 ? String(parsed) : r[field];
    }
  }
  return r as ImportRow;
}

// ─── Auto-Repair: fill in missing required fields ─────────────
// Only truly give up if there's no name AND no salary at all.
let _autoIdCounter = 1;

function autoRepairRow(row: ImportRow, rowIndex: number): ImportRow {
  const r = { ...row } as any;

  // 1. Name — try to infer firstName/lastName from any remaining unknown column
  if (!r.firstName || !r.lastName) {
    // scan raw (non-canonical) keys for something that looks like a name
    for (const [k, v] of Object.entries(r)) {
      if (['employeeId','email','department','designation','band','grade','annualFixed',
           'variablePay','annualCtc','workMode','workLocation','employmentType','employmentStatus',
           'reportingManagerEmail','costCenter','dateOfJoining','gender',
           'basicAnnual','basicMonthly','hra','hraMonthly','pfYearly','pfMonthly',
           'lta','ltaMonthly','specialAllowance','monthlySpecialAllowance',
           'subTotalA','subTotalAMonthly','monthlyGrossSalary','flexiTotalYearly','flexiTotalMonthly',
           'retentionBonus','joiningBonus','incentives',
           'april2023','july2023','april2024','july2024',
           'nickName','refNo','remarks','addedBy','compensationDocument','presentAddress','dateOfExit'].includes(k)) continue;
      if (typeof v === 'string' && v.trim() && /^[a-zA-Z\s]+$/.test(v.trim())) {
        const parts = v.trim().split(/\s+/);
        if (!r.firstName) r.firstName = parts[0];
        if (!r.lastName) r.lastName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
        break;
      }
    }
  }
  if (!r.firstName) r.firstName = `Employee`;
  if (!r.lastName) r.lastName = String(rowIndex + 1);

  // 2. employeeId — auto-generate
  if (!r.employeeId || !String(r.employeeId).trim()) {
    const prefix = (r.firstName || 'EMP').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'E');
    r.employeeId = `EMP-${prefix}-${String(_autoIdCounter++).padStart(4, '0')}`;
  }

  // 3. email — auto-generate, using employee ID as suffix to guarantee uniqueness
  if (!r.email || !String(r.email).trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
    // Fallback to 'emp'/'unknown' if stripping special chars produces an empty string
    const fn = (r.firstName || 'emp').toLowerCase().replace(/[^a-z0-9]/g, '') || 'emp';
    const ln = (r.lastName || String(rowIndex)).toLowerCase().replace(/[^a-z0-9]/g, '') || String(rowIndex + 1);
    const uid = String(r.employeeId || rowIndex + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
    r.email = `${fn}.${ln}.${uid}@company.com`;
  }

  // 4. annualFixed — fall back to annualCtc then variablePay, then 500000
  if (!r.annualFixed || parseSalary(r.annualFixed) <= 0) {
    if (r.annualCtc && parseSalary(r.annualCtc) > 0) {
      r.annualFixed = r.annualCtc;
    } else if (r.variablePay && parseSalary(r.variablePay) > 0) {
      r.annualFixed = r.variablePay;
    } else {
      r.annualFixed = '500000'; // ₹5L default
    }
  }

  // 5. department — default to 'General'
  if (!r.department || !String(r.department).trim()) r.department = 'General';

  // 6. designation — default to 'Employee'
  if (!r.designation || !String(r.designation).trim()) r.designation = 'Employee';

  // 7. gender — default PREFER_NOT_TO_SAY
  if (!r.gender || !VALID_GENDERS.includes(String(r.gender).toUpperCase())) {
    r.gender = 'PREFER_NOT_TO_SAY';
  }

  // 8. band — default A1, try to infer from designation/level
  if (!r.band || !VALID_BANDS.includes(String(r.band).toUpperCase())) {
    const des = String(r.designation || '').toLowerCase();
    if (des.includes('chief') || des.includes('cxo') || des.includes('vp') || des.includes('vice president')) r.band = 'D2';
    else if (des.includes('director')) r.band = 'D1';
    else if (des.includes('senior director')) r.band = 'D2';
    else if (des.includes('senior manager') || des.includes('sr manager')) r.band = 'M2';
    else if (des.includes('manager')) r.band = 'M1';
    else if (des.includes('lead') || des.includes('principal')) r.band = 'P3';
    else if (des.includes('p3') || des.includes('staff')) r.band = 'P3';
    else if (des.includes('manager') || des.includes('lead') || des.includes('principal')) r.band = 'P2';
    else if (des.includes('senior') || des.includes('sr.') || des.includes('specialist')) r.band = 'P1';
    else if (des.includes('associate') || des.includes('junior') || des.includes('jr.')) r.band = 'A2';
    else r.band = 'A1';
  }

  // 9. grade — default to band code
  if (!r.grade || !String(r.grade).trim()) r.grade = r.band || 'L1';

  // 10. dateOfJoining — default to 2 years ago
  if (!r.dateOfJoining || isNaN(Date.parse(r.dateOfJoining))) {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    r.dateOfJoining = twoYearsAgo.toISOString().split('T')[0];
  }

  return r as ImportRow;
}

// ─── Derive PerformanceRating records from Zoho revision cycles ──
// Each revision cycle column holds the annual fixed salary at that point.
// We compute the increment % between consecutive cycles and map it to a rating.
function ratingFromIncrement(pct: number): { rating: number; label: string } {
  if (pct >= 15) return { rating: 5.0, label: 'Outstanding' };
  if (pct >= 10) return { rating: 4.0, label: 'Exceeds Expectations' };
  if (pct >=  5) return { rating: 3.0, label: 'Meets Expectations' };
  if (pct >   0) return { rating: 2.5, label: 'Below Expectations' };
  return { rating: 2.0, label: 'Needs Improvement' };
}

// Batch version: collects all rating rows and bulk-inserts at the end of import
async function batchCreateRatingsFromRevisions(
  queue: { employeeId: string; row: ImportRow }[]
): Promise<void> {
  const toCreate: { employeeId: string; cycle: string; rating: number; ratingLabel: string }[] = [];

  for (const { employeeId, row } of queue) {
    const allCycles = [
      { cycle: 'April 2023', value: row.april2023 ? parseSalary(row.april2023) : null },
      { cycle: 'July 2023',  value: row.july2023  ? parseSalary(row.july2023)  : null },
      { cycle: 'April 2024', value: row.april2024 ? parseSalary(row.april2024) : null },
      { cycle: 'July 2024',  value: row.july2024  ? parseSalary(row.july2024)  : null },
    ];
    const cycles = allCycles
      .filter(c => c.value !== null && (c.value as number) > 0)
      .map(c => ({ cycle: c.cycle, value: c.value as number }));

    for (let i = 0; i < cycles.length; i++) {
      const curr = cycles[i];
      const prev = cycles[i - 1];
      const ratingData = prev
        ? ratingFromIncrement(((curr.value - prev.value) / prev.value) * 100)
        : { rating: 3.0, label: 'Meets Expectations' };
      toCreate.push({ employeeId, cycle: curr.cycle, rating: ratingData.rating, ratingLabel: ratingData.label });
    }
  }

  if (toCreate.length === 0) return;

  // createMany in chunks — skipDuplicates handles re-imports gracefully
  const CHUNK = 1000;
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    try {
      await prisma.performanceRating.createMany({
        data: toCreate.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
    } catch (err) {
      logger.warn('Batch rating insert error (non-fatal):', err);
    }
  }
  logger.info(`Batch-inserted ${toCreate.length} performance ratings`);
}

export const importService = {
  parseFile: (buffer: Buffer, mimetype: string): { rows: ImportRow[]; detectedColumns: string[] } => {
    try {
      let rawRows: Record<string, any>[];

      if (mimetype === 'text/csv' || mimetype === 'application/csv' || mimetype === 'text/plain') {
        rawRows = parse(buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, any>[];
      } else {
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
        // Try to find the sheet with the most data
        let bestSheet = workbook.SheetNames[0];
        let bestCount = 0;
        for (const name of workbook.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' });
          if (rows.length > bestCount) { bestCount = rows.length; bestSheet = name; }
        }
        rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[bestSheet], { defval: '' });
      }

      // Skip completely empty rows
      rawRows = rawRows.filter(r => Object.values(r).some(v => String(v).trim() !== ''));

      const { rows: normalised, detected } = normaliseHeaders(rawRows);
      const valued = normalised.map(normaliseValues);
      return { rows: valued, detectedColumns: detected };
    } catch (err) {
      logger.error('Failed to parse import file:', err);
      throw new Error('Invalid file format. Please upload a valid CSV or Excel file.');
    }
  },

  buildEmployeeData: async (row: ImportRow, managerEmailMap?: Map<string, string>) => {
    const annualFixed = parseSalary(row.annualFixed);
    // Use Zoho-provided breakdown values when available; fallback to standard ratios
    const basic = row.basicAnnual ? parseSalary(row.basicAnnual) : annualFixed * 0.35;
    const hra = row.hra ? parseSalary(row.hra) : annualFixed * 0.20;
    const lta = row.lta ? parseSalary(row.lta) : annualFixed * 0.05;
    const pf = row.pfYearly ? parseSalary(row.pfYearly) : basic * 0.12;
    const specialAllowance = row.specialAllowance ? parseSalary(row.specialAllowance) : annualFixed - basic - hra - lta;
    const variablePay = (row.variablePay !== undefined && row.variablePay !== '') ? parseSalary(row.variablePay) : 0;
    const annualCtc = row.annualCtc ? parseSalary(row.annualCtc) : annualFixed + variablePay + pf;
    const retentionBonus = row.retentionBonus ? parseSalary(row.retentionBonus) : 0;
    const joiningBonus = row.joiningBonus ? parseSalary(row.joiningBonus) : 0;
    const incentivesVal = row.incentives ? parseSalary(row.incentives) : 0;
    const flexiYearly = row.flexiTotalYearly ? parseSalary(row.flexiTotalYearly) : 0;
    const subTotalA = row.subTotalA ? parseSalary(row.subTotalA) : annualFixed;
    const monthlyGross = row.monthlyGrossSalary ? parseSalary(row.monthlyGrossSalary) : annualFixed / 12;

    // Revision cycle salary values
    const april2023 = row.april2023 ? parseSalary(row.april2023) : null;
    const july2023  = row.july2023  ? parseSalary(row.july2023)  : null;
    const april2024 = row.april2024 ? parseSalary(row.april2024) : null;
    const july2024  = row.july2024  ? parseSalary(row.july2024)  : null;

    let reportingManagerId: string | null = null;
    if (row.reportingManagerEmail?.trim()) {
      const normalizedEmail = row.reportingManagerEmail.trim().toLowerCase();
      if (managerEmailMap) {
        reportingManagerId = managerEmailMap.get(normalizedEmail) ?? null;
      } else {
        const manager = await prisma.employee.findFirst({
          where: { email: normalizedEmail, employmentStatus: 'ACTIVE' },
          select: { id: true },
        });
        reportingManagerId = manager?.id ?? null;
      }
    }

    const base = {
      employeeId: String(row.employeeId).trim(),
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      email: row.email.trim().toLowerCase(),
      department: row.department.trim(),
      designation: row.designation.trim(),
      dateOfJoining: new Date(row.dateOfJoining.trim()),
      gender: row.gender.trim().toUpperCase() as Gender,
      band: row.band.trim().toUpperCase(),
      grade: row.grade.trim(),
      annualFixed,
      variablePay,
      annualCtc,
      basicAnnual: basic,
      basicMonthly: basic / 12,
      hra,
      hraMonthly: hra / 12,
      lta,
      ltaMonthly: lta / 12,
      pfYearly: pf,
      pfMonthly: pf / 12,
      specialAllowance,
      monthlySpecialAllowance: specialAllowance / 12,
      flexiTotalYearly: flexiYearly,
      flexiTotalMonthly: flexiYearly / 12,
      subTotalA,
      subTotalAMonthly: subTotalA / 12,
      monthlyGrossSalary: monthlyGross,
      incentives: incentivesVal,
      joiningBonus,
      retentionBonus,
      // Revision cycles
      ...(april2023 !== null && { april2023 }),
      ...(july2023  !== null && { july2023 }),
      ...(april2024 !== null && { april2024 }),
      ...(july2024  !== null && { july2024 }),
      // Meta
      ...(row.nickName            && { nickName: row.nickName.trim() }),
      ...(row.refNo               && { refNo: row.refNo.trim() }),
      ...(row.remarks             && { remarks: row.remarks.trim() }),
      ...(row.addedBy             && { addedBy: row.addedBy.trim() }),
      ...(row.compensationDocument && { compensationDocument: row.compensationDocument.trim() }),
      workMode: (row.workMode?.trim().toUpperCase() || 'HYBRID') as WorkMode,
      workLocation: row.workLocation?.trim() || null,
      employmentType: (row.employmentType?.trim().toUpperCase() || 'FULL_TIME') as EmploymentType,
      employmentStatus: 'ACTIVE' as const,
      costCenter: row.costCenter?.trim() || null,
    };

    if (reportingManagerId) {
      return { ...base, reportingManager: { connect: { id: reportingManagerId } } };
    }
    return base;
  },

  autoEnrollBenefits: async (employeeIds: string[]): Promise<void> => {
    try {
      if (employeeIds.length === 0) return;
      const [benefits, employees] = await Promise.all([
        prisma.benefitsCatalog.findMany({ where: { isActive: true } }),
        prisma.employee.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, gender: true, employmentType: true, employmentStatus: true, band: true, dateOfJoining: true },
        }),
      ]);

      const now = new Date();
      const enrollments: {
        employeeId: string; benefitId: string; enrolledAt: Date;
        status: 'ACTIVE'; utilizationPercent: number; utilizedValue: number;
      }[] = [];

      for (const emp of employees) {
        const tenureMonths = Math.floor((now.getTime() - new Date(emp.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30));
        const bandIndex = (BAND_ORDER as readonly string[]).indexOf(emp.band);

        for (const benefit of benefits) {
          const criteria = benefit.eligibilityCriteria as any;
          if (criteria?.minPerformanceRating !== undefined) continue;
          if (criteria?.employmentTypes && !criteria.employmentTypes.includes(emp.employmentType)) continue;
          if (criteria?.genders && !criteria.genders.includes(emp.gender)) continue;
          if (criteria?.employmentStatuses && !criteria.employmentStatuses.includes(emp.employmentStatus)) continue;
          if (criteria?.minBandLevel !== undefined && bandIndex < criteria.minBandLevel) continue;
          if (criteria?.minTenureMonths !== undefined && tenureMonths < criteria.minTenureMonths) continue;

          enrollments.push({
            employeeId: emp.id, benefitId: benefit.id,
            enrolledAt: now, status: 'ACTIVE', utilizationPercent: 0, utilizedValue: 0,
          });
        }
      }

      // Bulk insert — skipDuplicates handles re-imports (replaces thousands of individual upserts)
      const CHUNK = 1000;
      for (let i = 0; i < enrollments.length; i += CHUNK) {
        await prisma.employeeBenefit.createMany({
          data: enrollments.slice(i, i + CHUNK),
          skipDuplicates: true,
        });
      }
      logger.info(`Auto-enrolled ${enrollments.length} benefit records for ${employees.length} imported employees`);
    } catch (err) {
      logger.warn('Benefits auto-enrollment error (non-fatal):', err);
    }
  },

  batchComputeDerivedFields: async (employeeIds: string[]): Promise<void> => {
    if (employeeIds.length === 0) return;

    // Load salary bands once — if none defined yet, only compute timeInCurrentGrade
    const salaryBandRows = await prisma.salaryBand.findMany({
      include: { band: true },
    });
    const bandMap = new Map(salaryBandRows.map(sb => [sb.band.code, sb]));

    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, band: true, annualFixed: true, dateOfJoining: true },
    });

    const now = new Date();
    const updates = employees.map(emp => {
      const sb = bandMap.get(emp.band);
      const annualFixed = Number(emp.annualFixed);
      const timeInCurrentGrade = Math.floor(
        (now.getTime() - new Date(emp.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      if (!sb) return { id: emp.id, compaRatio: null, payRangePenetration: null, timeInCurrentGrade };

      const mid = Number(sb.midSalary);
      const min = Number(sb.minSalary);
      const max = Number(sb.maxSalary);
      const compaRatio = mid > 0 ? (annualFixed / mid) * 100 : null;
      const payRangePenetration = max > min ? ((annualFixed - min) / (max - min)) * 100 : null;
      return { id: emp.id, compaRatio, payRangePenetration, timeInCurrentGrade };
    });

    // Parallel updates in chunks of 50 to stay within Neon connection limits
    const CHUNK = 50;
    for (let i = 0; i < updates.length; i += CHUNK) {
      await Promise.all(
        updates.slice(i, i + CHUNK).map(u =>
          prisma.employee.update({
            where: { id: u.id },
            data: {
              ...(u.compaRatio !== null && { compaRatio: u.compaRatio }),
              ...(u.payRangePenetration !== null && { payRangePenetration: u.payRangePenetration }),
              timeInCurrentGrade: u.timeInCurrentGrade,
            },
          })
        )
      );
    }
    logger.info(`Batch computed derived fields for ${updates.length} employees`);
  },

  invalidateAllCaches: async () => {
    try {
      // Wipe every module cache that derives its data from the employee table.
      // Promise.allSettled ensures one failing Redis key never blocks the rest.
      await Promise.allSettled([
        cacheDelPattern('dashboard:*'),
        cacheDelPattern('pay-equity:*'),
        cacheDelPattern('salary-bands:*'),
        cacheDelPattern('performance:*'),
        cacheDel('ai:dashboard-summary'),
        cacheDel('benefits:catalog'),
        cacheDel('benefits:utilization'),
      ]);
      // Expire all cached AI insights so they regenerate with fresh employee data.
      await prisma.aiInsight.updateMany({ data: { expiresAt: new Date() } });
      logger.info('All module caches invalidated after employee import');
    } catch (err) {
      logger.warn('Cache invalidation error (non-fatal):', err);
    }
  },

  processImport: async (
    rows: ImportRow[],
    options: { mode?: 'replace' | 'upsert'; detectedColumns?: string[] } = {}
  ): Promise<ImportResult> => {
    const { mode = 'upsert', detectedColumns = [] } = options;

    if (mode === 'replace') {
      logger.info('Replace mode: clearing all existing employees');
      await prisma.employee.deleteMany();
    }

    _autoIdCounter = 1;
    const allErrors: ImportError[] = [];
    const importedIds: string[] = [];
    let imported = 0;
    let failed = 0;
    const total = rows.length;
    const PARALLEL = 25; // concurrent DB writes per batch

    // ── 1. Pre-fetch manager email → ID map (one query, not N) ──────────────
    const managerEmails = [...new Set(
      rows.map(r => r.reportingManagerEmail?.trim().toLowerCase()).filter(Boolean) as string[]
    )];
    const managerRows = managerEmails.length > 0
      ? await prisma.employee.findMany({
          where: { email: { in: managerEmails }, employmentStatus: 'ACTIVE' },
          select: { id: true, email: true },
        })
      : [];
    const managerEmailMap = new Map(managerRows.filter(m => m.email != null).map(m => [m.email!, m.id]));

    // ── 2. Pre-fetch all existing employees in bulk (eliminates 2 findUnique per row) ──
    const allCsvEmployeeIds = rows.map(r => String(r.employeeId || '').trim()).filter(Boolean);
    const allCsvEmails     = rows.map(r => String(r.email || '').trim().toLowerCase()).filter(Boolean);

    const [prefetchedByEmpId, prefetchedByEmail] = await Promise.all([
      allCsvEmployeeIds.length > 0
        ? prisma.employee.findMany({
            where: { employeeId: { in: allCsvEmployeeIds } },
            select: { id: true, employeeId: true },
          })
        : [],
      allCsvEmails.length > 0
        ? prisma.employee.findMany({
            where: { email: { in: allCsvEmails } },
            select: { id: true, email: true },
          })
        : [],
    ]);

    const existingByEmpId = new Map(prefetchedByEmpId.map(e => [e.employeeId, e.id]));
    const existingByEmail  = new Map(prefetchedByEmail.map(e => [e.email, e.id]));

    // ── 3. Filter, auto-repair, and deduplicate emails within the CSV ────────
    const validRows: { row: ImportRow; index: number }[] = [];
    const seenEmailsInCsv = new Map<string, number>(); // email → count of times seen

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];
      const hasName   = rawRow.firstName?.trim() || rawRow.lastName?.trim();
      const hasSalary = parseSalary(rawRow.annualFixed) > 0
        || parseSalary(rawRow.annualCtc) > 0
        || parseSalary(rawRow.variablePay) > 0;
      if (!hasName && !hasSalary) continue; // truly blank — skip silently

      const repairedRow = autoRepairRow(rawRow, i);

      // Deduplicate emails within the CSV: if the same email appears more than
      // once, append a numeric suffix so each row gets a unique email address.
      // This handles real-world data where two employees share a name pattern
      // (e.g., two "Priya Sharma" → priya.sharma@co.com and priya.sharma.2@co.com).
      const baseEmail = repairedRow.email.toLowerCase();
      const count = (seenEmailsInCsv.get(baseEmail) || 0) + 1;
      seenEmailsInCsv.set(baseEmail, count);
      if (count > 1) {
        const [local, domain] = baseEmail.split('@');
        repairedRow.email = `${local}.${count}@${domain}`;
      }

      validRows.push({ row: repairedRow, index: i });
    }

    // ── 4. Collect rating data for batch insert after all writes ─────────────
    const ratingQueue: { employeeId: string; row: ImportRow }[] = [];

    // ── 5. Process in parallel batches of PARALLEL rows ─────────────────────
    for (let i = 0; i < validRows.length; i += PARALLEL) {
      const chunk = validRows.slice(i, i + PARALLEL);

      const results = await Promise.allSettled(
        chunk.map(async ({ row }) => {
          const data = await importService.buildEmployeeData(row, managerEmailMap);

          // Use pre-fetched maps — no per-row findUnique calls
          const empIdKey   = String(data.employeeId).trim();
          const existingId = existingByEmpId.get(empIdKey) ?? existingByEmail.get(data.email) ?? null;

          const employee = existingId
            ? await prisma.employee.update({ where: { id: existingId }, data })
            : await prisma.employee.create({ data });

          return { employee, row };
        })
      );

      for (let j = 0; j < results.length; j++) {
        const result  = results[j];
        const { index } = chunk[j];

        if (result.status === 'fulfilled') {
          const { employee, row } = result.value;
          importedIds.push(employee.id);
          imported++;
          // Update in-memory maps so later batches can reference newly-created employees
          existingByEmpId.set(employee.employeeId, employee.id);
          existingByEmail.set(employee.email, employee.id);
          ratingQueue.push({ employeeId: employee.id, row });
        } else {
          const err = result.reason as any;
          const isEmailConflict = err?.message?.includes('Unique constraint') &&
            (err?.meta?.target?.includes('email') || err?.message?.toLowerCase().includes('email'));

          if (isEmailConflict) {
            // Race condition: email already taken (e.g., parallel batch processed same email).
            // Retry once with a disambiguated email suffix.
            try {
              const row = chunk[j].row;
              const data = await importService.buildEmployeeData(row, managerEmailMap);
              const [local, domain] = data.email.split('@');
              data.email = `${local}.x${index + 2}@${domain}`;
              const employee = await prisma.employee.create({ data });
              importedIds.push(employee.id);
              imported++;
              existingByEmpId.set(employee.employeeId, employee.id);
              existingByEmail.set(employee.email, employee.id);
              ratingQueue.push({ employeeId: employee.id, row });
              logger.info(`Row ${index + 2}: email conflict resolved — saved as ${employee.email}`);
            } catch (retryErr: any) {
              allErrors.push({ row: index + 2, field: 'email', message: `Email conflict (retry failed): ${err?.message}` });
              failed++;
            }
          } else {
            const msg = err?.message || 'Database error';
            allErrors.push({ row: index + 2, field: 'general', message: msg });
            failed++;
            logger.warn(`Row ${index + 2} failed: ${msg}`);
          }
        }
      }

      emitEmployeeImportProgress({ processed: Math.min(i + PARALLEL, total), total, errors: allErrors });
    }

    // ── 6. Batch compute derived fields (compa-ratio, tenure) ────────────────
    await importService.batchComputeDerivedFields(importedIds);

    // ── 7. Batch insert performance ratings from revision cycles ─────────────
    await batchCreateRatingsFromRevisions(ratingQueue);

    // ── 8. Auto-enroll in benefits (bulk createMany) ─────────────────────────
    await importService.autoEnrollBenefits(importedIds);

    await importService.invalidateAllCaches();

    // Background-warm the AI performance inference cache so the Performance page
    // is ready immediately when the user navigates there after import.
    // Fire-and-forget — errors are already logged inside getAiInferredPerformance.
    getAiInferredPerformance().catch(() => {});

    const result: ImportResult = { imported, failed, errors: allErrors, replaced: mode === 'replace', detectedColumns };
    emitEmployeeImportComplete(result);
    return result;
  },

  generateTemplate: (): string => {
    // Zoho People Compensation Details View format
    const headers = [
      'Employee ID', 'First Name', 'Last Name', 'Email address',
      'Department', 'Designation', 'Reporting Manager', 'Date of Joining',
      'Employment Type', 'Employment Status', 'Gender', 'City of residence',
      'Annual Fixed', 'Variable Pay', 'Annual CTC',
      'April 2023', 'July 2023', 'April 2024', 'July 2024',
      'Basic Annual', 'HRA', 'PF Yearly', 'Special Allowance',
      'Monthly Gross Salary', 'Retention Bonus', 'Joining Bonus', 'Incentives',
      'Band', 'Grade',
    ];
    const r1 = ['EMP001','Priya','Sharma','priya.sharma@company.com','Engineering','Software Engineer II','','2022-01-15','FULL_TIME','ACTIVE','FEMALE','Bangalore','1200000','120000','1380000','900000','960000','1100000','1200000','420000','240000','50400','189600','100000','0','0','0','P1','P1-1'];
    const r2 = ['EMP002','Rahul','Verma','rahul.verma@company.com','Sales','Account Executive','','2023-06-01','FULL_TIME','ACTIVE','MALE','Mumbai','800000','80000','928000','','','750000','800000','280000','160000','33600','126400','66667','0','0','0','A2','A2-1'];
    return [headers.join(','), r1.join(','), r2.join(',')].join('\n');
  },
};
