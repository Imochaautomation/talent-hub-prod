import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { jobArchitectureService, ServiceError } from '../services/jobArchitecture.service';
import {
  parseImportFile,
  previewBulkImport,
  applyBulkImport,
  generateImportTemplate,
} from '../services/jobArchitectureImport.service';
import { logAction } from '../services/auditLog.service';
import { emitJobArchitectureRefresh, emitSalaryBandUpdated } from '../lib/socket';
import {
  createJobAreaSchema,
  updateJobAreaSchema,
  createJobFamilySchema,
  updateJobFamilySchema,
  createBandSchema,
  updateBandSchema,
  createGradeSchema,
  updateGradeSchema,
  createJobCodeSchema,
  updateJobCodeSchema,
} from '../schemas/jobArchitecture.schemas';

const parseOrThrow = <T>(schema: ZodSchema<T>, body: unknown): T => {
  try {
    return schema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      const e: any = new Error('Invalid request body');
      e.status = 400;
      e.code = 'VALIDATION_ERROR';
      e.details = { issues: err.issues };
      throw e;
    }
    throw err;
  }
};

const handleError = (e: any, res: Response, next: NextFunction) => {
  if (e instanceof ServiceError || (typeof e?.status === 'number' && typeof e?.code === 'string')) {
    return res.status(e.status).json({
      error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) },
    });
  }
  next(e);
};

const userId = (req: Request) => req.user?.userId ?? 'system';

export const jobArchitectureController = {
  // ─── Reads ──────────────────────────────────────────────────────
  getHierarchy: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getHierarchy() }); } catch (e) { next(e); }
  },
  getJobAreas: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getJobAreas() }); } catch (e) { next(e); }
  },
  getJobFamilies: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getJobFamilies(req.query.jobAreaId as string | undefined) }); } catch (e) { next(e); }
  },
  getBands: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getBands() }); } catch (e) { next(e); }
  },
  getGrades: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getGrades(req.query.bandId as string | undefined) }); } catch (e) { next(e); }
  },
  getJobCodes: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { bandId, jobFamilyId } = req.query as Record<string, string>;
      res.json({ data: await jobArchitectureService.getJobCodes({ bandId, jobFamilyId }) });
    } catch (e) { next(e); }
  },
  getSkills: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getSkills() }); } catch (e) { next(e); }
  },

  // ─── JobArea ────────────────────────────────────────────────────
  createJobArea: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(createJobAreaSchema, req.body);
      const result = await jobArchitectureService.createJobArea(data);
      void logAction({ userId: userId(req), action: 'JOB_AREA_CREATED', entityType: 'JobArea', entityId: result.id, metadata: { name: result.name }, ip: req.ip });
      emitJobArchitectureRefresh();
      res.status(201).json({ data: result });
    } catch (e) { handleError(e, res, next); }
  },
  updateJobArea: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(updateJobAreaSchema, req.body);
      const result = await jobArchitectureService.updateJobArea(req.params.id, data);
      void logAction({ userId: userId(req), action: 'JOB_AREA_UPDATED', entityType: 'JobArea', entityId: result.id, metadata: data, ip: req.ip });
      emitJobArchitectureRefresh();
      res.json({ data: result });
    } catch (e) { handleError(e, res, next); }
  },
  deleteJobArea: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await jobArchitectureService.deleteJobArea(req.params.id);
      void logAction({ userId: userId(req), action: 'JOB_AREA_DELETED', entityType: 'JobArea', entityId: req.params.id, ip: req.ip });
      emitJobArchitectureRefresh();
      res.json({ data: { success: true } });
    } catch (e) { handleError(e, res, next); }
  },

  // ─── JobFamily ──────────────────────────────────────────────────
  createJobFamily: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(createJobFamilySchema, req.body);
      const result = await jobArchitectureService.createJobFamily(data);
      void logAction({ userId: userId(req), action: 'JOB_FAMILY_CREATED', entityType: 'JobFamily', entityId: result.id, metadata: { name: result.name, jobAreaId: result.jobAreaId }, ip: req.ip });
      emitJobArchitectureRefresh();
      res.status(201).json({ data: result });
    } catch (e) { handleError(e, res, next); }
  },
  updateJobFamily: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(updateJobFamilySchema, req.body);
      const result = await jobArchitectureService.updateJobFamily(req.params.id, data);
      void logAction({ userId: userId(req), action: 'JOB_FAMILY_UPDATED', entityType: 'JobFamily', entityId: result.id, metadata: data, ip: req.ip });
      emitJobArchitectureRefresh();
      res.json({ data: result });
    } catch (e) { handleError(e, res, next); }
  },
  deleteJobFamily: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await jobArchitectureService.deleteJobFamily(req.params.id);
      void logAction({ userId: userId(req), action: 'JOB_FAMILY_DELETED', entityType: 'JobFamily', entityId: req.params.id, ip: req.ip });
      emitJobArchitectureRefresh();
      res.json({ data: { success: true } });
    } catch (e) { handleError(e, res, next); }
  },

  // ─── Band ───────────────────────────────────────────────────────
  createBand: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(createBandSchema, req.body);
      const result = await jobArchitectureService.createBand(data);
      void logAction({ userId: userId(req), action: 'BAND_CREATED', entityType: 'Band', entityId: result.id, metadata: { code: result.code, level: result.level }, ip: req.ip });
      emitJobArchitectureRefresh();
      emitSalaryBandUpdated();
      res.status(201).json({ data: result });
    } catch (e) { handleError(e, res, next); }
  },
  updateBand: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(updateBandSchema, req.body);
      const result = await jobArchitectureService.updateBand(req.params.id, data);
      void logAction({ userId: userId(req), action: 'BAND_UPDATED', entityType: 'Band', entityId: result.id, metadata: data, ip: req.ip });
      emitJobArchitectureRefresh();
      emitSalaryBandUpdated();
      res.json({ data: result });
    } catch (e) { handleError(e, res, next); }
  },
  deleteBand: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await jobArchitectureService.deleteBand(req.params.id);
      void logAction({ userId: userId(req), action: 'BAND_DELETED', entityType: 'Band', entityId: req.params.id, ip: req.ip });
      emitJobArchitectureRefresh();
      emitSalaryBandUpdated();
      res.json({ data: { success: true } });
    } catch (e) { handleError(e, res, next); }
  },

  // ─── Grade ──────────────────────────────────────────────────────
  createGrade: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(createGradeSchema, req.body);
      const result = await jobArchitectureService.createGrade(data);
      void logAction({ userId: userId(req), action: 'GRADE_CREATED', entityType: 'Grade', entityId: result.id, metadata: { gradeCode: result.gradeCode, bandId: result.bandId }, ip: req.ip });
      emitJobArchitectureRefresh();
      res.status(201).json({ data: result });
    } catch (e) { handleError(e, res, next); }
  },
  updateGrade: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(updateGradeSchema, req.body);
      const result = await jobArchitectureService.updateGrade(req.params.id, data);
      void logAction({ userId: userId(req), action: 'GRADE_UPDATED', entityType: 'Grade', entityId: result.id, metadata: data, ip: req.ip });
      emitJobArchitectureRefresh();
      res.json({ data: result });
    } catch (e) { handleError(e, res, next); }
  },
  deleteGrade: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await jobArchitectureService.deleteGrade(req.params.id);
      void logAction({ userId: userId(req), action: 'GRADE_DELETED', entityType: 'Grade', entityId: req.params.id, ip: req.ip });
      emitJobArchitectureRefresh();
      res.json({ data: { success: true } });
    } catch (e) { handleError(e, res, next); }
  },

  // ─── JobCode ────────────────────────────────────────────────────
  createJobCode: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(createJobCodeSchema, req.body);
      const result = await jobArchitectureService.createJobCode(data);
      void logAction({ userId: userId(req), action: 'JOB_CODE_CREATED', entityType: 'JobCode', entityId: result.id, metadata: { code: result.code, title: result.title }, ip: req.ip });
      emitJobArchitectureRefresh();
      res.status(201).json({ data: result });
    } catch (e) { handleError(e, res, next); }
  },
  updateJobCode: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = parseOrThrow(updateJobCodeSchema, req.body);
      const result = await jobArchitectureService.updateJobCode(req.params.id, data);
      void logAction({ userId: userId(req), action: 'JOB_CODE_UPDATED', entityType: 'JobCode', entityId: result.id, metadata: data, ip: req.ip });
      emitJobArchitectureRefresh();
      res.json({ data: result });
    } catch (e) { handleError(e, res, next); }
  },
  deleteJobCode: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await jobArchitectureService.deleteJobCode(req.params.id);
      void logAction({ userId: userId(req), action: 'JOB_CODE_DELETED', entityType: 'JobCode', entityId: req.params.id, ip: req.ip });
      emitJobArchitectureRefresh();
      res.json({ data: { success: true } });
    } catch (e) { handleError(e, res, next); }
  },

  // ─── Skills (unchanged thin pass-through) ───────────────────────
  createSkill: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json({ data: await jobArchitectureService.createSkill(req.body) }); } catch (e) { next(e); }
  },
  updateSkill: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.updateSkill(req.params.id, req.body) }); } catch (e) { next(e); }
  },

  // ─── Bulk Import ─────────────────────────────────────────────────
  downloadImportTemplate: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const buf = await generateImportTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="job_architecture_import_template.xlsx"');
      res.send(buf);
    } catch (e) { next(e); }
  },

  previewBulkImport: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded.' } });
        return;
      }
      const { rows, errors, employeeLinks } = parseImportFile(req.file.buffer, req.file.mimetype);
      if (rows.length === 0 && errors.length === 0 && employeeLinks.length === 0) {
        res.status(400).json({ error: { code: 'EMPTY_FILE', message: 'No job architecture data found in the uploaded file. Check that sheets have valid column headers or matrix format.' } });
        return;
      }
      const result = await previewBulkImport(rows, errors, employeeLinks);
      void logAction({ userId: userId(req), action: 'JOB_ARCH_BULK_IMPORT_PREVIEW', entityType: 'JobCode', entityId: 'bulk', metadata: { parsedCount: result.parsedCount }, ip: req.ip });
      res.json({ data: result });
    } catch (e: any) {
      if (e?.status) return res.status(e.status).json({ error: { code: 'IMPORT_ERROR', message: e.message } });
      next(e);
    }
  },

  applyBulkImport: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { previewToken, mode } = req.body as { previewToken?: string; mode?: string };
      if (!previewToken) {
        res.status(400).json({ error: { code: 'MISSING_TOKEN', message: 'previewToken is required.' } });
        return;
      }
      if (mode !== 'add_new' && mode !== 'replace') {
        res.status(400).json({ error: { code: 'INVALID_MODE', message: 'mode must be "add_new" or "replace".' } });
        return;
      }
      const result = await applyBulkImport(previewToken, mode);
      void logAction({ userId: userId(req), action: 'JOB_ARCH_BULK_IMPORT_APPLIED', entityType: 'JobCode', entityId: 'bulk', metadata: { mode, ...result }, ip: req.ip });
      try { emitJobArchitectureRefresh(); } catch { /* non-fatal */ }
      res.json({ data: result });
    } catch (e: any) {
      if (e?.status) return res.status(e.status).json({ error: { code: 'IMPORT_ERROR', message: e.message } });
      next(e);
    }
  },
};
