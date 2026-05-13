import { api } from '../lib/api';

export const jobArchitectureService = {
  getHierarchy: async () => {
    const res = await api.get<{ data: any[] }>('/job-architecture/hierarchy');
    return res.data;
  },

  // ── Job Areas ───────────────────────────────────────────────────────
  getJobAreas: async () => {
    const res = await api.get<{ data: any[] }>('/job-areas');
    return res.data;
  },
  createJobArea: async (data: { name: string; description?: string }) => {
    const res = await api.post<{ data: any }>('/job-areas', data);
    return res.data;
  },
  updateJobArea: async (id: string, data: { name?: string; description?: string }) => {
    const res = await api.put<{ data: any }>(`/job-areas/${id}`, data);
    return res.data;
  },
  deleteJobArea: async (id: string) => {
    await api.delete(`/job-areas/${id}`);
  },

  // ── Job Families ────────────────────────────────────────────────────
  getJobFamilies: async (jobAreaId?: string) => {
    const res = await api.get<{ data: any[] }>(`/job-families${jobAreaId ? `?jobAreaId=${jobAreaId}` : ''}`);
    return res.data;
  },
  createJobFamily: async (data: { name: string; jobAreaId: string }) => {
    const res = await api.post<{ data: any }>('/job-families', data);
    return res.data;
  },
  updateJobFamily: async (id: string, data: { name: string }) => {
    const res = await api.put<{ data: any }>(`/job-families/${id}`, data);
    return res.data;
  },
  deleteJobFamily: async (id: string) => {
    await api.delete(`/job-families/${id}`);
  },

  // ── Bands ───────────────────────────────────────────────────────────
  getBands: async () => {
    const res = await api.get<{ data: any[] }>('/bands');
    return res.data;
  },
  createBand: async (data: { code: string; label: string; level: number; isEligibleForRSU?: boolean }) => {
    const res = await api.post<{ data: any }>('/bands', data);
    return res.data;
  },
  updateBand: async (id: string, data: { code?: string; label?: string; level?: number; isEligibleForRSU?: boolean }) => {
    const res = await api.put<{ data: any }>(`/bands/${id}`, data);
    return res.data;
  },
  deleteBand: async (id: string) => {
    await api.delete(`/bands/${id}`);
  },

  // ── Grades ──────────────────────────────────────────────────────────
  getGrades: async (bandId?: string) => {
    const res = await api.get<{ data: any[] }>(`/grades${bandId ? `?bandId=${bandId}` : ''}`);
    return res.data;
  },
  createGrade: async (data: { bandId: string; gradeCode: string; description?: string }) => {
    const res = await api.post<{ data: any }>('/grades', data);
    return res.data;
  },
  updateGrade: async (id: string, data: { gradeCode?: string; description?: string }) => {
    const res = await api.put<{ data: any }>(`/grades/${id}`, data);
    return res.data;
  },
  deleteGrade: async (id: string) => {
    await api.delete(`/grades/${id}`);
  },

  // ── Job Codes ───────────────────────────────────────────────────────
  getJobCodes: async (filters?: { bandId?: string; jobFamilyId?: string }) => {
    const params = new URLSearchParams(filters as any);
    const res = await api.get<{ data: any[] }>(`/job-codes?${params}`);
    return res.data;
  },
  createJobCode: async (data: { code: string; title: string; jobFamilyId: string; bandId: string; gradeId?: string }) => {
    const res = await api.post<{ data: any }>('/job-codes', data);
    return res.data;
  },
  updateJobCode: async (id: string, data: {
    code?: string; title?: string; bandId?: string; gradeId?: string | null;
    jobFunction?: string; reportsTo?: string; roleSummary?: string;
    roleResponsibilities?: string; managerResponsibility?: string;
    educationExperience?: string; skillsRequired?: string;
  }) => {
    const res = await api.put<{ data: any }>(`/job-codes/${id}`, data);
    return res.data;
  },
  deleteJobCode: async (id: string) => {
    await api.delete(`/job-codes/${id}`);
  },

  // ── Employee detail fetch ────────────────────────────────────────────
  getEmployee: async (id: string) => {
    const res = await api.get<{ data: any }>(`/employees/${id}`);
    return res.data;
  },

  // ── Employee ↔ Job Code linking ─────────────────────────────────────
  searchEmployees: async (q: string) => {
    const res = await api.get<{ data: any[] }>(`/employees?search=${encodeURIComponent(q)}&limit=10`);
    return res.data;
  },
  linkEmployee: async (employeeId: string, jobCodeId: string) => {
    const res = await api.put<{ data: any }>(`/employees/${employeeId}`, { jobCodeId });
    return res.data;
  },
  unlinkEmployee: async (employeeId: string) => {
    const res = await api.put<{ data: any }>(`/employees/${employeeId}`, { jobCodeId: null });
    return res.data;
  },

  // ── Skills ──────────────────────────────────────────────────────────
  getSkills: async () => {
    const res = await api.get<{ data: any[] }>('/skills');
    return res.data;
  },
};
