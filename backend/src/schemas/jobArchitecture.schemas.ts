/**
 * Zod validation schemas for the Job Architecture module.
 * Used by jobArchitecture.controller.ts to validate request bodies.
 */
import { z } from 'zod';

// Trim and collapse runs of whitespace to a single space
const trimmedName = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Name is required').max(120));

const optionalTrimmedDescription = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().max(500))
  .optional()
  .or(z.literal('').transform(() => undefined));

// ─── JobArea ──────────────────────────────────────────────────
export const createJobAreaSchema = z.object({
  name: trimmedName,
  description: optionalTrimmedDescription,
});

export const updateJobAreaSchema = z.object({
  name: trimmedName.optional(),
  description: optionalTrimmedDescription,
});

// ─── JobFamily ────────────────────────────────────────────────
export const createJobFamilySchema = z.object({
  name: trimmedName,
  jobAreaId: z.string().uuid('Invalid jobAreaId'),
});

export const updateJobFamilySchema = z.object({
  name: trimmedName.optional(),
});

// ─── Band ─────────────────────────────────────────────────────
export const createBandSchema = z.object({
  code: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().min(1).max(10)),
  label: trimmedName,
  level: z.number().int().min(0).max(999),
  isEligibleForRSU: z.boolean().optional(),
});

export const updateBandSchema = z.object({
  code: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().min(1).max(10))
    .optional(),
  label: trimmedName.optional(),
  level: z.number().int().min(0).max(999).optional(),
  isEligibleForRSU: z.boolean().optional(),
});

// ─── Grade ────────────────────────────────────────────────────
export const createGradeSchema = z.object({
  bandId: z.string().uuid('Invalid bandId'),
  gradeCode: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().min(1).max(20)),
  description: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(500))
    .optional(),
});

export const updateGradeSchema = z.object({
  gradeCode: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().min(1).max(20))
    .optional(),
  description: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(500))
    .optional(),
});

// ─── JobCode ──────────────────────────────────────────────────
export const createJobCodeSchema = z.object({
  code: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().min(1).max(50)),
  title: trimmedName,
  jobFamilyId: z.string().uuid('Invalid jobFamilyId'),
  bandId: z.string().uuid('Invalid bandId'),
  gradeId: z.string().uuid('Invalid gradeId').optional(),
  jobSubFamilyId: z.string().uuid('Invalid jobSubFamilyId').optional(),
});

// undefined = preserve existing, null = clear, string = set
export const updateJobCodeSchema = z.object({
  code: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().min(1).max(50))
    .optional(),
  title: trimmedName.optional(),
  bandId: z.string().uuid('Invalid bandId').optional(),
  gradeId: z.union([z.string().uuid('Invalid gradeId'), z.null()]).optional(),
  jobSubFamilyId: z.union([z.string().uuid('Invalid jobSubFamilyId'), z.null()]).optional(),
  jobFunction: z.string().max(2000).optional(),
  reportsTo: z.string().max(200).optional(),
  roleSummary: z.string().max(5000).optional(),
  roleResponsibilities: z.string().max(10000).optional(),
  managerResponsibility: z.string().max(5000).optional(),
  educationExperience: z.string().max(2000).optional(),
  skillsRequired: z.string().max(5000).optional(),
});

// ─── JobSubFamily ─────────────────────────────────────────────
export const createJobSubFamilySchema = z.object({
  name: trimmedName,
  jobFamilyId: z.string().uuid('Invalid jobFamilyId'),
});

export const updateJobSubFamilySchema = z.object({
  name: trimmedName.optional(),
});

export type CreateJobAreaInput = z.infer<typeof createJobAreaSchema>;
export type UpdateJobAreaInput = z.infer<typeof updateJobAreaSchema>;
export type CreateJobFamilyInput = z.infer<typeof createJobFamilySchema>;
export type UpdateJobFamilyInput = z.infer<typeof updateJobFamilySchema>;
export type CreateBandInput = z.infer<typeof createBandSchema>;
export type UpdateBandInput = z.infer<typeof updateBandSchema>;
export type CreateGradeInput = z.infer<typeof createGradeSchema>;
export type UpdateGradeInput = z.infer<typeof updateGradeSchema>;
export type CreateJobCodeInput = z.infer<typeof createJobCodeSchema>;
export type UpdateJobCodeInput = z.infer<typeof updateJobCodeSchema>;
export type CreateJobSubFamilyInput = z.infer<typeof createJobSubFamilySchema>;
export type UpdateJobSubFamilyInput = z.infer<typeof updateJobSubFamilySchema>;
