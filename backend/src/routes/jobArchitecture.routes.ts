import { Router } from 'express';
import multer from 'multer';
import { jobArchitectureController as ctrl } from '../controllers/jobArchitecture.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

// Mounted at /api/ — full paths relative to /api
router.get('/job-architecture/hierarchy', ctrl.getHierarchy);

router.get('/job-areas', ctrl.getJobAreas);
router.post('/job-areas', requireRole('ADMIN', 'HR_MANAGER'), ctrl.createJobArea);
router.put('/job-areas/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.updateJobArea);

router.get('/job-families', ctrl.getJobFamilies);
router.post('/job-families', requireRole('ADMIN', 'HR_MANAGER'), ctrl.createJobFamily);
router.put('/job-families/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.updateJobFamily);
router.delete('/job-families/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.deleteJobFamily);

router.delete('/job-areas/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.deleteJobArea);

router.get('/bands', ctrl.getBands);
router.post('/bands', requireRole('ADMIN', 'HR_MANAGER'), ctrl.createBand);
router.put('/bands/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.updateBand);
router.delete('/bands/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.deleteBand);

router.get('/grades', ctrl.getGrades);
router.post('/grades', requireRole('ADMIN', 'HR_MANAGER'), ctrl.createGrade);
router.put('/grades/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.updateGrade);
router.delete('/grades/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.deleteGrade);

router.get('/job-codes', ctrl.getJobCodes);
router.post('/job-codes', requireRole('ADMIN', 'HR_MANAGER'), ctrl.createJobCode);
router.put('/job-codes/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.updateJobCode);
router.delete('/job-codes/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.deleteJobCode);

router.get('/skills', ctrl.getSkills);
router.post('/skills', requireRole('ADMIN', 'HR_MANAGER'), ctrl.createSkill);
router.put('/skills/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.updateSkill);

// ─── Bulk Import ──────────────────────────────────────────────────────────────
router.get('/job-architecture/bulk-import/template', requireRole('ADMIN', 'HR_MANAGER'), ctrl.downloadImportTemplate);
router.post('/job-architecture/bulk-import/preview', requireRole('ADMIN', 'HR_MANAGER'), upload.single('file'), ctrl.previewBulkImport);
router.post('/job-architecture/bulk-import/apply', requireRole('ADMIN', 'HR_MANAGER'), ctrl.applyBulkImport);

export default router;
