import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { emitJobArchitectureRefresh, emitEmployeeDataChanged } from '../lib/socket';
import logger from '../lib/logger';

// ─── In-memory preview token store (10-min TTL, no Redis dependency) ─────────
interface CachedPreview {
  rows: ParsedRow[];
  errors: ParseError[];
  employeeLinks: EmployeeLinkRow[];
  expiresAt: number;
}
const previewStore = new Map<string, CachedPreview>();

function storeParsed(data: Omit<CachedPreview, 'expiresAt'>): string {
  const token = randomUUID();
  previewStore.set(token, { ...data, expiresAt: Date.now() + 10 * 60 * 1000 });
  // Clean up expired tokens
  for (const [k, v] of previewStore) {
    if (v.expiresAt < Date.now()) previewStore.delete(k);
  }
  return token;
}

function retrieveParsed(token: string): CachedPreview | null {
  const entry = previewStore.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { previewStore.delete(token); return null; }
  return entry;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedRow {
  _sourceSheet: string;
  _sourceRow: number;
  jobArea: string;
  jobFamily: string;
  jobTitle: string;
  bandCode: string;
  gradeCode?: string;
  jobCode?: string;
  jobFunction?: string;
  reportsTo?: string;
  roleSummary?: string;
  roleResponsibilities?: string;
  managerResponsibility?: string;
  educationExperience?: string;
  skillsRequired?: string;
}

export type DiffItemType = 'JobArea' | 'JobFamily' | 'Band' | 'Grade' | 'JobCode';

export interface DiffItem {
  type: DiffItemType;
  name: string;
  details?: Record<string, unknown>;
}

export interface ConflictItem {
  type: DiffItemType;
  name: string;
  existing: Record<string, unknown>;
  incoming: Record<string, unknown>;
}

export interface ParseError {
  row: number;
  sheet: string;
  message: string;
}

export interface EmployeeLinkRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  designation: string;
  department: string;
  grade: string;
  annualFixed: number | null;
  annualCtc: number | null;
  dateOfJoining: Date | null;
}

export interface PreviewResult {
  parsedCount: number;
  toCreate: DiffItem[];
  toUpdate: ConflictItem[];
  unchanged: number;
  errors: ParseError[];
  employeeLinksCount: number;
  previewToken: string;
}

export interface ApplyResult {
  created: number;
  updated: number;
  employeesLinked: number;
  skipped: number;
  errors: ParseError[];
}

// ─── Column name aliases ──────────────────────────────────────────────────────

const AREA_ALIASES = ['job area', 'main stream', 'area', 'department', 'stream'];
const FAMILY_ALIASES = ['job family', 'sub stream', 'sub-stream', 'family', 'sub stream name', 'function'];
const TITLE_ALIASES = ['job title', 'roles', 'role', 'title', 'designation', 'position'];
const BAND_ALIASES = ['band code', 'band', 'grade/level', 'level/grade', 'level', 'grade'];
const GRADE_CODE_ALIASES = ['grade code', 'sub grade', 'sub-grade'];
const JOB_CODE_ALIASES = ['job code', 'code', 'role code'];
const JOB_FUNC_ALIASES = ['job function', 'function'];
const REPORTS_TO_ALIASES = ['reports to', 'reporting to', 'reports  to'];
const ROLE_SUMMARY_ALIASES = ['role summary', 'summary', 'role description', 'description'];
const ROLE_RESP_ALIASES = ['role responsibilities', 'responsibilities', 'role resposibilities'];
const MANAGER_RESP_ALIASES = ['manager responsibility', 'manager responsiility', 'manager responsibilities'];
const EDU_EXP_ALIASES = ['education & experience', 'education and experience', 'education & experiences', 'experience'];
const SKILLS_ALIASES = ['skills required', 'skills', 'required skills'];

function normaliseKey(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function findCol(headers: string[], aliases: string[]): string | undefined {
  const normHeaders = headers.map(normaliseKey);
  for (const alias of aliases) {
    const idx = normHeaders.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  return undefined;
}

function str(val: unknown): string {
  return val != null ? String(val).trim() : '';
}

// Generate a deterministic job code slug from title + band
function slugify(title: string, band: string): string {
  const words = title.trim().toUpperCase().split(/\s+/);
  const initials = words.map(w => w[0] || '').join('').substring(0, 4);
  return `${initials}-${band}`.replace(/[^A-Z0-9-]/g, '');
}

// ─── Format A: Detail Row Parser ─────────────────────────────────────────────

function parseDetailSheet(ws: XLSX.WorkSheet, sheetName: string): { rows: ParsedRow[]; errors: ParseError[] } {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  if (raw.length === 0) return { rows: [], errors: [] };

  const headers = Object.keys(raw[0]);
  const areaCol     = findCol(headers, AREA_ALIASES);
  const familyCol   = findCol(headers, FAMILY_ALIASES);
  const titleCol    = findCol(headers, TITLE_ALIASES);
  const bandCol     = findCol(headers, BAND_ALIASES);
  const gradeCol    = findCol(headers, GRADE_CODE_ALIASES);
  const jobCodeCol  = findCol(headers, JOB_CODE_ALIASES);
  const funcCol     = findCol(headers, JOB_FUNC_ALIASES);
  const reportsCol  = findCol(headers, REPORTS_TO_ALIASES);
  const summaryCol  = findCol(headers, ROLE_SUMMARY_ALIASES);
  const respCol     = findCol(headers, ROLE_RESP_ALIASES);
  const mgrRespCol  = findCol(headers, MANAGER_RESP_ALIASES);
  const eduCol      = findCol(headers, EDU_EXP_ALIASES);
  const skillsCol   = findCol(headers, SKILLS_ALIASES);

  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  // When band column is missing but grade column exists, treat grade as band (for Engg JD)
  const effectiveBandCol = bandCol ?? gradeCol;

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const rowNum = i + 2; // 1-indexed + header row

    const jobArea   = areaCol   ? str(r[areaCol])   : '';
    const jobFamily = familyCol ? str(r[familyCol]) : '';
    const jobTitle  = titleCol  ? str(r[titleCol])  : '';
    const rawBand   = effectiveBandCol ? str(r[effectiveBandCol]) : '';

    // Skip completely empty rows or rows missing any required field
    if (!jobTitle || !rawBand || !jobArea || !jobFamily) continue;

    // Normalise band: strip numeric prefix like "1" or "2" if the level code follows
    const bandCode = rawBand.toUpperCase().replace(/^\d+\s*[-–]\s*/, '').trim();

    rows.push({
      _sourceSheet: sheetName,
      _sourceRow: rowNum,
      jobArea,
      jobFamily,
      jobTitle,
      bandCode,
      gradeCode: (gradeCol && gradeCol !== effectiveBandCol) ? str(r[gradeCol]) || undefined : undefined,
      jobCode: jobCodeCol ? str(r[jobCodeCol]) || undefined : undefined,
      jobFunction: funcCol     ? str(r[funcCol])     || undefined : undefined,
      reportsTo:   reportsCol  ? str(r[reportsCol])  || undefined : undefined,
      roleSummary: summaryCol  ? str(r[summaryCol])  || undefined : undefined,
      roleResponsibilities: respCol    ? str(r[respCol])    || undefined : undefined,
      managerResponsibility: mgrRespCol ? str(r[mgrRespCol]) || undefined : undefined,
      educationExperience:   eduCol    ? str(r[eduCol])    || undefined : undefined,
      skillsRequired: skillsCol ? str(r[skillsCol]) || undefined : undefined,
    });
  }

  return { rows, errors };
}

// ─── Format B: Matrix / Grid Parser ──────────────────────────────────────────

function parseMatrixSheet(ws: XLSX.WorkSheet, sheetName: string): { rows: ParsedRow[]; errors: ParseError[] } {
  // sheet_to_json with header:1 gives us raw 2D arrays
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  if (raw.length < 3) return { rows: [], errors: [] };

  // Row 0 (Excel row 1): area name — find first non-empty cell after col 2
  let areaName = '';
  const row0 = raw[0] as unknown[];
  for (let c = 0; c < row0.length; c++) {
    const v = str(row0[c]);
    if (v) { areaName = v; break; }
  }
  // No area name found in the sheet — skip entirely, no fallback to sheet name
  if (!areaName) return { rows: [], errors: [] };

  // Row 1 (Excel row 2): headers — col0=Bands, col1=Level, col2+= family names
  const row1 = raw[1] as unknown[];
  const families: string[] = [];
  for (let c = 2; c < row1.length; c++) {
    families.push(str(row1[c]));
  }

  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  for (let i = 2; i < raw.length; i++) {
    const dataRow = raw[i] as unknown[];
    const rowNum = i + 1;
    const bandCode = str(dataRow[1]).toUpperCase(); // Level column
    if (!bandCode) continue;

    for (let c = 2; c < families.length + 2; c++) {
      const familyName = families[c - 2];
      if (!familyName) continue;

      const jobTitle = str(dataRow[c]);
      if (!jobTitle || jobTitle.toLowerCase() === 'na' || jobTitle === '-') continue;

      rows.push({
        _sourceSheet: sheetName,
        _sourceRow: rowNum,
        jobArea: areaName,
        jobFamily: familyName,
        jobTitle,
        bandCode,
      });
    }
  }

  return { rows, errors };
}

// ─── Format Detection ─────────────────────────────────────────────────────────

function isMatrixSheet(ws: XLSX.WorkSheet): boolean {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  if (raw.length < 2) return false;
  const row1 = (raw[1] as unknown[]).map(v => normaliseKey(str(v)));
  return row1.includes('bands') || row1.includes('level');
}

function hasDetailColumns(ws: XLSX.WorkSheet): boolean {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', range: 0 });
  if (raw.length === 0) return false;
  const normKeys = Object.keys(raw[0]).map(normaliseKey);
  // Must have BOTH a title-like column AND a band/level column
  // (avoids matching employee sheets that have Department + Designation but no band)
  const hasTitle = TITLE_ALIASES.some(m => normKeys.includes(m));
  const hasBand = [...BAND_ALIASES, ...GRADE_CODE_ALIASES].some(m => normKeys.includes(m));
  return hasTitle && hasBand;
}

function isSimpleListSheet(ws: XLSX.WorkSheet): boolean {
  // Sheets like "Pre sales": row 1 is the header with a 'Level' column and role title column(s)
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  if (raw.length === 0) return false;
  const normKeys = Object.keys(raw[0]).map(normaliseKey);
  return normKeys.includes('level') && !normKeys.includes('bands');
}

function parseSimpleListSheet(ws: XLSX.WorkSheet, sheetName: string): { rows: ParsedRow[]; errors: ParseError[] } {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  if (raw.length === 0) return { rows: [], errors: [] };

  const headers = Object.keys(raw[0]);
  const levelCol  = findCol(headers, ['level', 'grade']);
  const areaCol   = findCol(headers, AREA_ALIASES);
  const skipNorm  = new Set(['bands', 'level', 'grade', 'reporting to', 'reporting  to', 'reports to', ...AREA_ALIASES]);
  // All non-skip, non-area columns are treated as job family / role title columns
  const roleCols = headers.filter(h => !skipNorm.has(normaliseKey(h)));

  const rows: ParsedRow[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const bandCode  = levelCol ? str(r[levelCol]).toUpperCase() : '';
    const jobArea   = areaCol  ? str(r[areaCol])                : '';
    if (!bandCode || !jobArea) continue; // both required — no fallback

    for (const roleCol of roleCols) {
      const jobTitle = str(r[roleCol]);
      if (!jobTitle || jobTitle.toLowerCase() === 'na' || jobTitle === '-') continue;
      rows.push({
        _sourceSheet: sheetName,
        _sourceRow: i + 2,
        jobArea,
        jobFamily: roleCol.trim(),
        jobTitle,
        bandCode,
      });
    }
  }
  return { rows, errors: [] };
}

function isEmployeeSheet(ws: XLSX.WorkSheet): boolean {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', range: 0 });
  if (raw.length === 0) return false;
  const normKeys = Object.keys(raw[0]).map(normaliseKey);
  return normKeys.some(k => k.includes('employee id') || k.includes('first name') || k.includes('annual ctc'));
}

function parseSalaryValue(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val > 0 ? val : null;
  const s = String(val).trim();
  // Extract leading number from strings like "1800000 ( Rupees Eighteen Lakh Only)"
  const match = s.match(/^[\d,]+/);
  if (match) {
    const n = parseFloat(match[0].replace(/,/g, ''));
    return isNaN(n) || n <= 0 ? null : n;
  }
  return null;
}

function parseEmployeeSheet(ws: XLSX.WorkSheet): EmployeeLinkRow[] {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  if (raw.length === 0) return [];

  const headers = Object.keys(raw[0]);
  const empIdCol       = findCol(headers, ['employee id', 'emp id', 'employee_id', 'empid']);
  const firstNameCol   = findCol(headers, ['first name', 'firstname']);
  const lastNameCol    = findCol(headers, ['last name', 'lastname']);
  const emailCol       = findCol(headers, ['email', 'email address', 'work email', 'official email']);
  const desigCol       = findCol(headers, ['designation', 'job title', 'roles', 'role']);
  const deptCol        = findCol(headers, ['department', 'dept']);
  const gradeCol       = findCol(headers, ['grade/level', 'grade', 'level', 'band']);
  const annualFixedCol = findCol(headers, ['annual fixed', 'annualfixed', 'fixed pay', 'fixed']);
  const annualCtcCol   = findCol(headers, ['annual ctc', 'annualctc', 'ctc', 'total ctc']);
  const dojCol         = findCol(headers, ['date of joining', 'dateofjoining', 'joining date', 'doj', 'date joined']);

  const links: EmployeeLinkRow[] = [];
  for (const r of raw) {
    const employeeId  = empIdCol       ? str(r[empIdCol])       : '';
    const firstName   = firstNameCol   ? str(r[firstNameCol])   : '';
    const lastName    = lastNameCol    ? str(r[lastNameCol])     : '';
    const designation = desigCol       ? str(r[desigCol])       : '';
    const department  = deptCol        ? str(r[deptCol])        : '';
    const grade       = gradeCol       ? str(r[gradeCol])       : '';
    const annualFixed = annualFixedCol ? parseSalaryValue(r[annualFixedCol]) : null;
    const annualCtc   = annualCtcCol   ? parseSalaryValue(r[annualCtcCol])   : null;

    // Use email from sheet if present; otherwise leave null
    const rawEmail = emailCol ? str(r[emailCol]) : '';
    const email = rawEmail || null;

    let dateOfJoining: Date | null = null;
    if (dojCol && r[dojCol] != null && r[dojCol] !== '') {
      const raw = r[dojCol];
      if (raw instanceof Date) {
        dateOfJoining = raw;
      } else if (typeof raw === 'number') {
        // Excel serial date → JS Date
        dateOfJoining = new Date(Math.round((raw - 25569) * 86400000));
      } else {
        const d = new Date(str(raw));
        if (!isNaN(d.getTime())) dateOfJoining = d;
      }
    }

    if (!employeeId || !firstName) continue;
    links.push({ employeeId, firstName, lastName, email, designation, department, grade, annualFixed, annualCtc, dateOfJoining });
  }
  return links;
}

// ─── Main parse entry point ───────────────────────────────────────────────────

export function parseImportFile(buffer: Buffer, mimetype: string): { rows: ParsedRow[]; errors: ParseError[]; employeeLinks: EmployeeLinkRow[] } {
  try {
    let wb: XLSX.WorkBook;
    if (mimetype === 'text/csv' || mimetype === 'application/csv' || mimetype === 'text/plain') {
      // Wrap CSV as a workbook with a single sheet
      wb = XLSX.read(buffer, { type: 'buffer' });
    } else {
      wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    }

    const allRows: ParsedRow[] = [];
    const allErrors: ParseError[] = [];
    const allEmployeeLinks: EmployeeLinkRow[] = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      // Employee roster sheets — parse for job-code linking, then continue to next sheet
      if (isEmployeeSheet(ws)) {
        allEmployeeLinks.push(...parseEmployeeSheet(ws));
        continue;
      }

      // Skip known non-data sheets by name
      const sheetLower = sheetName.toLowerCase();
      if (sheetLower.includes('template') || sheetLower.includes('reference') || sheetLower.includes('legend')) continue;

      if (isMatrixSheet(ws)) {
        const { rows, errors } = parseMatrixSheet(ws, sheetName);
        allRows.push(...rows);
        allErrors.push(...errors);
      } else if (hasDetailColumns(ws)) {
        const { rows, errors } = parseDetailSheet(ws, sheetName);
        allRows.push(...rows);
        allErrors.push(...errors);
      } else if (isSimpleListSheet(ws)) {
        const { rows, errors } = parseSimpleListSheet(ws, sheetName);
        allRows.push(...rows);
        allErrors.push(...errors);
      }
      // Otherwise skip (legend/instructions/unknown)
    }

    return { rows: allRows, errors: allErrors, employeeLinks: allEmployeeLinks };
  } catch (err) {
    logger.error('Failed to parse job architecture import file:', err);
    throw new Error('Invalid file format. Please upload a valid CSV or Excel file.');
  }
}

// ─── Preview (dry-run diff) ───────────────────────────────────────────────────

export async function previewBulkImport(rows: ParsedRow[], errors: ParseError[], employeeLinks: EmployeeLinkRow[]): Promise<PreviewResult> {
  // Load current DB state
  const [dbAreas, dbFamilies, dbBands, dbGrades, dbJobCodes] = await Promise.all([
    prisma.jobArea.findMany(),
    prisma.jobFamily.findMany(),
    prisma.band.findMany(),
    prisma.grade.findMany(),
    prisma.jobCode.findMany({ include: { band: true, grade: true, jobFamily: { include: { jobArea: true } } } }),
  ]);

  const areaMap   = new Map(dbAreas.map(a => [a.name.toLowerCase(), a]));
  const familyMap = new Map(dbFamilies.map(f => [`${f.jobAreaId}::${f.name.toLowerCase()}`, f]));
  const bandMap   = new Map(dbBands.map(b => [b.code.toLowerCase(), b]));
  const gradeMap  = new Map(dbGrades.map(g => [`${g.bandId}::${g.gradeCode.toLowerCase()}`, g]));
  const jobCodeMap= new Map(dbJobCodes.map(jc => [jc.title.toLowerCase(), jc]));

  const toCreate: DiffItem[] = [];
  const toUpdate: ConflictItem[] = [];
  let unchanged = 0;
  const seen = new Set<string>(); // deduplicate toCreate

  for (const row of rows) {
    const areaKey   = row.jobArea.toLowerCase();
    const bandKey   = row.bandCode.toLowerCase();
    const titleKey  = row.jobTitle.toLowerCase();

    // Check/plan band
    if (!bandMap.has(bandKey)) {
      const createKey = `Band::${bandKey}`;
      if (!seen.has(createKey)) {
        seen.add(createKey);
        toCreate.push({ type: 'Band', name: row.bandCode, details: { code: row.bandCode } });
      }
    }

    // Check/plan area
    if (!areaMap.has(areaKey)) {
      const createKey = `JobArea::${areaKey}`;
      if (!seen.has(createKey)) {
        seen.add(createKey);
        toCreate.push({ type: 'JobArea', name: row.jobArea });
      }
    }

    // Check/plan family — we need area ID to look up, but area may be new
    // For existing areas, check family; for new areas the family is implicitly new too
    const existingArea = areaMap.get(areaKey);
    if (existingArea) {
      const famKey = `${existingArea.id}::${row.jobFamily.toLowerCase()}`;
      if (!familyMap.has(famKey)) {
        const createKey = `JobFamily::${areaKey}::${row.jobFamily.toLowerCase()}`;
        if (!seen.has(createKey)) {
          seen.add(createKey);
          toCreate.push({ type: 'JobFamily', name: row.jobFamily, details: { jobArea: row.jobArea } });
        }
      }
    } else {
      const createKey = `JobFamily::${areaKey}::${row.jobFamily.toLowerCase()}`;
      if (!seen.has(createKey)) {
        seen.add(createKey);
        toCreate.push({ type: 'JobFamily', name: row.jobFamily, details: { jobArea: row.jobArea } });
      }
    }

    // Check/plan grade if specified
    if (row.gradeCode) {
      const existingBand = bandMap.get(bandKey);
      if (existingBand) {
        const gKey = `${existingBand.id}::${row.gradeCode.toLowerCase()}`;
        if (!gradeMap.has(gKey)) {
          const createKey = `Grade::${bandKey}::${row.gradeCode.toLowerCase()}`;
          if (!seen.has(createKey)) {
            seen.add(createKey);
            toCreate.push({ type: 'Grade', name: row.gradeCode, details: { bandCode: row.bandCode } });
          }
        }
      } else {
        const createKey = `Grade::${bandKey}::${row.gradeCode.toLowerCase()}`;
        if (!seen.has(createKey)) {
          seen.add(createKey);
          toCreate.push({ type: 'Grade', name: row.gradeCode, details: { bandCode: row.bandCode } });
        }
      }
    }

    // Check/plan job code
    const existingCode = jobCodeMap.get(titleKey);
    if (!existingCode) {
      const createKey = `JobCode::${titleKey}`;
      if (!seen.has(createKey)) {
        seen.add(createKey);
        toCreate.push({ type: 'JobCode', name: row.jobTitle, details: {
          jobArea: row.jobArea, jobFamily: row.jobFamily, bandCode: row.bandCode,
        } });
      }
    } else {
      // Check if anything differs
      const incomingBandCode = row.bandCode.toLowerCase();
      const existingBandCode = existingCode.band?.code.toLowerCase() ?? '';
      const hasDiff = incomingBandCode !== existingBandCode ||
        (row.roleSummary && row.roleSummary !== existingCode.roleSummary) ||
        (row.reportsTo && row.reportsTo !== existingCode.reportsTo);

      if (hasDiff) {
        const updateKey = `JobCodeUpdate::${titleKey}`;
        if (!seen.has(updateKey)) {
          seen.add(updateKey);
          toUpdate.push({
            type: 'JobCode',
            name: row.jobTitle,
            existing: {
              bandCode: existingCode.band?.code,
              reportsTo: existingCode.reportsTo,
              roleSummary: existingCode.roleSummary ? existingCode.roleSummary.substring(0, 80) + '…' : null,
            },
            incoming: {
              bandCode: row.bandCode,
              reportsTo: row.reportsTo,
              roleSummary: row.roleSummary ? row.roleSummary.substring(0, 80) + '…' : null,
            },
          });
        }
      } else {
        unchanged++;
      }
    }
  }

  // Cache rows in Redis for 10 minutes
  const previewToken = storeParsed({ rows, errors, employeeLinks });

  return {
    parsedCount: rows.length,
    toCreate,
    toUpdate,
    unchanged,
    errors,
    employeeLinksCount: employeeLinks.length,
    previewToken,
  };
}

// ─── Apply ────────────────────────────────────────────────────────────────────

export async function applyBulkImport(
  previewToken: string,
  mode: 'add_new' | 'replace',
): Promise<ApplyResult> {
  const cached = retrieveParsed(previewToken);
  if (!cached) throw Object.assign(new Error('Preview session expired. Please re-upload the file.'), { status: 410 });

  const { rows, employeeLinks = [] } = cached;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let employeesLinked = 0;
  const errors: ParseError[] = [];

  try {

  // Build working maps — we'll mutate these as we create new records
  const areaMap   = new Map<string, string>(); // name.lower → id
  const familyMap = new Map<string, string>(); // areaId::name.lower → id
  const bandMap   = new Map<string, string>(); // code.lower → id
  const gradeMap  = new Map<string, string>(); // bandId::code.lower → id
  const jobCodeTitleMap = new Map<string, string>(); // title.lower → id

  // Seed maps from DB
  for (const a of await prisma.jobArea.findMany())     areaMap.set(a.name.toLowerCase(), a.id);
  for (const f of await prisma.jobFamily.findMany())   familyMap.set(`${f.jobAreaId}::${f.name.toLowerCase()}`, f.id);
  for (const b of await prisma.band.findMany())        bandMap.set(b.code.toLowerCase(), b.id);
  for (const g of await prisma.grade.findMany())       gradeMap.set(`${g.bandId}::${g.gradeCode.toLowerCase()}`, g.id);
  const allJc = await prisma.jobCode.findMany({ select: { id: true, title: true, code: true } });
  for (const jc of allJc) jobCodeTitleMap.set(jc.title.toLowerCase(), jc.id);

  // Track all existing job codes by code string to avoid slug collisions
  const usedCodes = new Set(allJc.map(jc => jc.code.toUpperCase()));

  // Helper: get max band level from DB to safely assign new levels
  const maxBandLevel = async () => {
    const agg = await prisma.band.aggregate({ _max: { level: true } });
    return agg._max.level ?? -1;
  };
  let nextBandLevel = (await maxBandLevel()) + 1;

  // Helper: generate a unique job code string
  const uniqueCode = (base: string): string => {
    const upper = base.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!usedCodes.has(upper)) { usedCodes.add(upper); return upper; }
    let i = 2;
    while (usedCodes.has(`${upper}-${i}`)) i++;
    usedCodes.add(`${upper}-${i}`);
    return `${upper}-${i}`;
  };

  for (const row of rows) {
    try {
      // 1. Ensure Band — upsert by code to avoid level/code unique conflicts
      const bandKey = row.bandCode.toLowerCase();
      if (!bandMap.has(bandKey)) {
        const band = await prisma.band.upsert({
          where: { code: row.bandCode.toUpperCase() },
          create: { code: row.bandCode.toUpperCase(), label: row.bandCode.toUpperCase(), level: nextBandLevel++ },
          update: {},
        });
        bandMap.set(bandKey, band.id);
        created++;
      }
      const bandId = bandMap.get(bandKey)!;

      // 2. Ensure Grade (if specified)
      let gradeId: string | undefined;
      if (row.gradeCode) {
        const gradeKey = `${bandId}::${row.gradeCode.toLowerCase()}`;
        if (!gradeMap.has(gradeKey)) {
          const grade = await prisma.grade.create({ data: { bandId, gradeCode: row.gradeCode.toUpperCase() } });
          gradeMap.set(gradeKey, grade.id);
          created++;
        }
        gradeId = gradeMap.get(gradeKey);
      }

      // 3. Ensure JobArea
      const areaKey = row.jobArea.toLowerCase();
      if (!areaMap.has(areaKey)) {
        const area = await prisma.jobArea.create({ data: { name: row.jobArea } });
        areaMap.set(areaKey, area.id);
        created++;
      }
      const areaId = areaMap.get(areaKey)!;

      // 4. Ensure JobFamily
      const famKey = `${areaId}::${row.jobFamily.toLowerCase()}`;
      if (!familyMap.has(famKey)) {
        const family = await prisma.jobFamily.create({ data: { name: row.jobFamily, jobAreaId: areaId } });
        familyMap.set(famKey, family.id);
        created++;
      }
      const jobFamilyId = familyMap.get(famKey)!;

      // 5. JobCode — upsert by title
      const titleKey = row.jobTitle.toLowerCase();
      const code = uniqueCode(row.jobCode || slugify(row.jobTitle, row.bandCode));
      const richFields = {
        jobFunction: row.jobFunction,
        reportsTo: row.reportsTo,
        roleSummary: row.roleSummary,
        roleResponsibilities: row.roleResponsibilities,
        managerResponsibility: row.managerResponsibility,
        educationExperience: row.educationExperience,
        skillsRequired: row.skillsRequired,
      };

      if (!jobCodeTitleMap.has(titleKey)) {
        // Always create new ones
        const jc = await prisma.jobCode.create({ data: {
          code,
          title: row.jobTitle,
          jobFamilyId,
          bandId,
          gradeId: gradeId ?? null,
          ...richFields,
        } });
        jobCodeTitleMap.set(titleKey, jc.id);
        created++;
      } else if (mode === 'replace') {
        const existingId = jobCodeTitleMap.get(titleKey)!;
        // Strip undefined values — only update fields that are provided
        const updateData: Record<string, unknown> = { bandId, jobFamilyId };
        if (gradeId) updateData.gradeId = gradeId;
        for (const [k, v] of Object.entries(richFields)) {
          if (v !== undefined && v !== '') updateData[k] = v;
        }
        await prisma.jobCode.update({ where: { id: existingId }, data: updateData });
        updated++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      errors.push({ row: row._sourceRow, sheet: row._sourceSheet, message: err.message ?? 'Unknown error' });
    }
  }

  // ── Upsert employees from Excel data: create if new, update if existing ──────
  if (employeeLinks.length > 0) {
    // Load job codes with their band so we can derive band for new employees
    const allJobCodes = await prisma.jobCode.findMany({
      select: { id: true, title: true, band: { select: { code: true } } },
    });
    const titleToJobCode = new Map(allJobCodes.map(jc => [jc.title.toLowerCase(), jc]));

    // Process in batches of 10 to stay within Neon connection limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < employeeLinks.length; i += BATCH_SIZE) {
      const batch = employeeLinks.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (link) => {
        if (!link.employeeId || !link.firstName) return;

        // Match designation → job code (exact first, then partial containment)
        const desigLower = link.designation.toLowerCase();
        let matchedJc = titleToJobCode.get(desigLower) ?? null;
        if (!matchedJc) {
          for (const [title, jc] of titleToJobCode) {
            if (desigLower.includes(title) || title.includes(desigLower)) {
              matchedJc = jc;
              break;
            }
          }
        }
        const jobCodeId   = matchedJc?.id   ?? null;
        const bandCode    = matchedJc?.band?.code ?? '';

        try {
          const createData: Record<string, unknown> = {
            employeeId:    link.employeeId,
            firstName:     link.firstName,
            lastName:      link.lastName || '',
            department:    link.department || '',
            designation:   link.designation || '',
            dateOfJoining: link.dateOfJoining ?? new Date(),
            grade:         link.grade || '',
            band:          bandCode,
            gender:        'PREFER_NOT_TO_SAY',
            annualFixed:   link.annualFixed ?? 0,
            annualCtc:     link.annualCtc   ?? 0,
          };
          if (link.email)  createData.email     = link.email;
          if (jobCodeId)   createData.jobCodeId  = jobCodeId;

          const updateData: Record<string, unknown> = {};
          if (link.email)          updateData.email         = link.email;
          if (link.designation)    updateData.designation   = link.designation;
          if (link.department)     updateData.department    = link.department;
          if (link.grade)          updateData.grade         = link.grade;
          if (link.annualFixed)    updateData.annualFixed   = link.annualFixed;
          if (link.annualCtc)      updateData.annualCtc     = link.annualCtc;
          if (jobCodeId)           updateData.jobCodeId     = jobCodeId;
          if (bandCode)            updateData.band          = bandCode;
          if (link.dateOfJoining)  updateData.dateOfJoining = link.dateOfJoining;

          await (prisma.employee.upsert as any)({
            where: { employeeId: link.employeeId },
            create: createData,
            update: updateData,
          });
          employeesLinked++;
        } catch { /* non-fatal — e.g. email unique conflict on re-import */ }
      }));
    }
  }

    // Emit socket events — wrapped so a Redis/Socket.io failure never kills the import response
    try { emitJobArchitectureRefresh(); } catch { /* non-fatal */ }
    if (employeesLinked > 0) {
      try { emitEmployeeDataChanged(); } catch { /* non-fatal */ }
    }

    return { created, updated, skipped, employeesLinked, errors };
  } catch (err: any) {
    logger.error('applyBulkImport failed:', { message: err?.message, stack: err?.stack });
    throw err;
  }
}

// ─── Template Generator ───────────────────────────────────────────────────────

export async function generateImportTemplate(): Promise<Buffer> {
  const bands = await prisma.band.findMany({ orderBy: { level: 'asc' } });
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Instructions ─────────────────────────────────────────────────────
  const instrRows = [
    ['JOB ARCHITECTURE BULK IMPORT — HOW TO USE THIS TEMPLATE'],
    [],
    ['REQUIRED COLUMNS (every row must have these)'],
    ['  Job Area',   'Top-level grouping — e.g. Engineering, Marketing, Sales'],
    ['  Job Family', 'Sub-group within the area — e.g. Development, Brand Marketing'],
    ['  Job Title',  'Exact role name — e.g. Software Engineer, SEO Specialist'],
    ['  Band Code',  'Level code — e.g. A1, A2, P1, P2, M1. New bands are created automatically.'],
    [],
    ['OPTIONAL COLUMNS (leave blank if not applicable)'],
    ['  Grade Code',             'Sub-grade within a band — e.g. G1, G2'],
    ['  Job Code',               'Short unique code — auto-generated if left blank (e.g. SE-P1)'],
    ['  Job Function',           'Functional area or team'],
    ['  Reports To',             'Role title this position reports to'],
    ['  Role Summary',           'Brief description of the role'],
    ['  Role Responsibilities',  'Key duties — use numbered list or bullet points'],
    ['  Manager Responsibility', 'People management obligations (or "N/A")'],
    ['  Education & Experience', 'Qualifications and years of experience required'],
    ['  Skills Required',        'Comma-separated list of required skills'],
    [],
    ['RULES'],
    ['  • All four required columns must be filled for a row to be imported'],
    ['  • Rows with any required field missing are silently skipped'],
    ['  • Duplicate job titles: existing ones are skipped (or replaced if you choose Replace mode)'],
    ['  • New Job Areas, Job Families, Bands and Grades are created automatically'],
    ['  • Column order does not matter — headers are matched by name'],
    [],
    ['EMPLOYEE LINKING (optional — add a separate sheet named "Employees")'],
    ['  If you include a sheet with columns: Employee ID, First Name, Last Name, Designation'],
    ['  the system will automatically link each employee to their matching job code by designation.'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr['!cols'] = [{ wch: 30 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

  // ── Sheet 2: Import data (the one users fill in) ──────────────────────────────
  const REQUIRED = ['Job Area', 'Job Family', 'Job Title', 'Band Code'];
  const OPTIONAL = ['Grade Code', 'Job Code', 'Job Function', 'Reports To', 'Role Summary',
    'Role Responsibilities', 'Manager Responsibility', 'Education & Experience', 'Skills Required'];
  const headers = [...REQUIRED, ...OPTIONAL];

  const examples = [
    ['Engineering', 'Development', 'Associate Software Engineer', 'A1', '', 'ASE-A1',
      'Development', 'Technical Lead',
      'Assist senior engineers in developing and testing software.',
      '1. Write code to meet requirements\n2. Participate in code reviews\n3. Fix bugs',
      'N/A', '0-2 years. BSc in Computer Science or related field.',
      'Java, Python, OOP, SQL'],
    ['Engineering', 'Development', 'Software Engineer', 'P1', '', 'SE-P1',
      'Development', 'Technical Lead',
      'Design, develop and test software applications across the full lifecycle.',
      '1. Design algorithms\n2. Write efficient reusable code\n3. Troubleshoot and debug',
      'N/A', '2-4 years. BSc in Computer Science or related field.',
      'Java, Python, REST APIs, Git'],
    ['Engineering', 'Development', 'Senior Software Engineer', 'P2', '', 'SSE-P2',
      'Development', 'Technical Lead',
      'Lead complex software development and mentor junior engineers.',
      '1. Architect systems\n2. Lead code reviews\n3. Drive technical roadmap',
      'N/A', 'Minimum 4 years. Proven experience with software frameworks.',
      'Java, Microservices, Cloud (AWS/Azure), CI/CD'],
    ['Marketing', 'Brand Marketing', 'Brand Marketing Executive', 'A2', '', 'BME-A2',
      'Brand Marketing', 'Brand Marketing Manager',
      'Execute brand marketing campaigns across digital and offline channels.',
      '1. Assist in campaign execution\n2. Monitor brand metrics\n3. Coordinate with agencies',
      'N/A', '1-2 years in marketing. Degree in Marketing or Communications.',
      'Brand Strategy, Social Media, Canva, Google Analytics'],
    ['Marketing', 'SEO / SEM', 'SEO Specialist', 'P1', '', 'SEO-P1',
      'Digital Marketing', 'Digital Marketing Manager',
      'Drive organic growth through on-page and off-page SEO strategies.',
      '1. Conduct keyword research\n2. Optimise website content\n3. Build backlinks',
      'N/A', '2-4 years in SEO. Google Analytics certified preferred.',
      'SEO, Google Analytics, Ahrefs, SEM Rush, Content Strategy'],
    ['Customer Success', 'Customer Support', 'Customer Support Executive', 'A2', '', 'CSE-A2',
      'Customer Support', 'Customer Support Manager',
      'Provide first-line support and resolve customer queries.',
      '1. Handle inbound tickets\n2. Escalate complex issues\n3. Maintain CSAT scores',
      'N/A', '1-2 years in customer support.',
      'CRM tools, Communication, Problem Solving'],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws2['!cols'] = headers.map((h, i) => ({ wch: i < 4 ? 24 : Math.max(h.length + 4, 18) }));
  XLSX.utils.book_append_sheet(wb, ws2, 'Job Architecture Data');

  // ── Sheet 3: Band reference ───────────────────────────────────────────────────
  const bandHeaders = ['Band Code', 'Band Label', 'Sort Level', 'RSU Eligible',
    '', 'Tip: Use any of these Band Codes in the "Band Code" column above.'];
  const bandRows = bands.map(b => [b.code, b.label, b.level, b.isEligibleForRSU ? 'Yes' : 'No']);
  const ws3 = XLSX.utils.aoa_to_sheet([bandHeaders, ...bandRows]);
  ws3['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 4 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Band Reference');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}
