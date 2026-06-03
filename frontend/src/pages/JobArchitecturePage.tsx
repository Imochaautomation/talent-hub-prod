import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers, ChevronRight, ChevronDown, Building2,
  Briefcase, Tag, Star, Search, Pencil, Plus,
  Trash2, X, Check, Loader2, CheckCheck, Users, Lock, Upload, FolderOpen,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import BulkImportJobArchModal from '../components/BulkImportJobArchModal';
import ImportEmployeesModal from '../components/ImportEmployeesModal';
import EmployeeDirectoryPage from './EmployeeDirectoryPage';
import { toast } from 'sonner';
import { jobArchitectureService } from '../services/jobArchitecture.service';
import AddEmployeeModal from '../components/employees/AddEmployeeModal';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';
import { BAND_ORDER } from '../../../shared/constants';

// ─── Constants ────────────────────────────────────────────────────────────────

// Words that appear in department/team names — used to rule out false person-name extractions
const DEPT_WORDS = new Set([
  'Support', 'Success', 'Engineering', 'Sales', 'Marketing', 'Operations',
  'Finance', 'Product', 'Design', 'Research', 'Management', 'Services',
  'Development', 'Analytics', 'Strategy', 'Business', 'Customer', 'Technical',
  'Quality', 'Infrastructure', 'Platform', 'Growth', 'Enterprise', 'Commercial',
  'Corporate', 'Digital', 'Innovation', 'Consulting', 'Advisory', 'Division',
  'Team', 'Group', 'Department', 'Unit', 'Center', 'Solutions', 'Delivery',
  'Enablement', 'Intelligence', 'Experience', 'Partnership', 'Partnerships',
]);

function looksLikePersonName(name: string): boolean {
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  // Every word must start with a capital letter and contain only letters
  if (!words.every(w => /^[A-Z][a-zA-Zà-öø-ÿ]*$/.test(w))) return false;
  return !words.some(w => DEPT_WORDS.has(w));
}

// Extract all employee names from a job title.
// Handles: "Title - Name", "Title - Name1 || Name2", "Title - Dept - Name"
function extractEmployeeNames(title: string): string[] {
  const firstDash = title.indexOf(' - ');
  if (firstDash === -1) return [];

  const afterFirstDash = title.substring(firstDash + 3).trim();

  // Case 1: multiple employees separated by ||
  if (afterFirstDash.includes('||')) {
    return afterFirstDash.split('||').map(n => n.trim()).filter(looksLikePersonName);
  }

  // Case 2: single name after first dash passes person-name check
  if (looksLikePersonName(afterFirstDash)) return [afterFirstDash];

  // Case 3: double-dash title like "Director - Solutioning - Kshitij Deshmukh"
  //         — try the segment after the LAST dash
  const lastDash = title.lastIndexOf(' - ');
  if (lastDash !== firstDash) {
    const afterLastDash = title.substring(lastDash + 3).trim();
    if (looksLikePersonName(afterLastDash)) return [afterLastDash];
  }

  return [];
}

// Return the clean job title with any embedded employee name stripped.
function getCleanTitle(title: string): string {
  const firstDash = title.indexOf(' - ');
  if (firstDash === -1) return title;

  const afterFirstDash = title.substring(firstDash + 3).trim();

  if (afterFirstDash.includes('||')) return title.substring(0, firstDash).trim();
  if (looksLikePersonName(afterFirstDash)) return title.substring(0, firstDash).trim();

  const lastDash = title.lastIndexOf(' - ');
  if (lastDash !== firstDash) {
    const afterLastDash = title.substring(lastDash + 3).trim();
    if (looksLikePersonName(afterLastDash)) return title.substring(0, lastDash).trim();
  }

  return title;
}

const BAND_COLORS: Record<string, string> = {
  // Associate
  A1: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  A2: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
  A3: 'bg-slate-300 text-slate-900 dark:bg-slate-600 dark:text-slate-100',
  // Professional
  P1: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  P2: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  P3: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  P4: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
  // Manager
  M0: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  M1: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  M2: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  M3: 'bg-orange-200 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200',
  // Director
  D0: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  D1: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  D2: 'bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-200',
  // VP
  V0: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  V1: 'bg-pink-200 text-pink-800 dark:bg-pink-900/60 dark:text-pink-200',
  V2: 'bg-pink-300 text-pink-900 dark:bg-pink-900/80 dark:text-pink-100',
  // Executive
  E0: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  E1: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  E2: 'bg-emerald-300 text-emerald-900 dark:bg-emerald-900/80 dark:text-emerald-100',
};

const AREA_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
];

const AREA_ACCENT_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4',
];

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function BandPill({ code, label, isRSU }: { code: string; label: string; isRSU: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', BAND_COLORS[code] || 'bg-muted text-muted-foreground')}>
      {code}
      {isRSU && <Star className="w-2.5 h-2.5 fill-current" />}
    </span>
  );
}

// ─── Generic inline modal ─────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground text-base">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/60 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn('w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary', className)}
    />
  );
}

function SaveBtn({ loading, disabled, onClick, label = 'Save' }: {
  loading: boolean; disabled?: boolean; onClick: () => void; label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
    >
      Cancel
    </button>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ label, onConfirm, onCancel, loading }: {
  label: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <Modal title={`Delete ${label}?`} onClose={onCancel}>
      <p className="text-sm text-muted-foreground">
        This will permanently delete <strong className="text-foreground">{label}</strong> and all its contents.
        This action cannot be undone.
      </p>
      <div className="flex gap-2 justify-end pt-2">
        <CancelBtn onClick={onCancel} />
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50 hover:bg-destructive/90 transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Delete
        </button>
      </div>
    </Modal>
  );
}

// ─── Area Modal ───────────────────────────────────────────────────────────────

function AreaModal({ area, onClose, onSaved }: {
  area?: any; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(area?.name ?? '');
  const [description, setDescription] = useState(area?.description ?? '');

  const create = useMutation({
    mutationFn: () => jobArchitectureService.createJobArea({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: () => { toast.success('Job area created'); onSaved(); },
    onError: () => toast.error('Failed to create job area'),
  });

  const update = useMutation({
    mutationFn: () => jobArchitectureService.updateJobArea(area.id, { name: name.trim(), description: description.trim() || undefined }),
    onSuccess: () => { toast.success('Job area updated'); onSaved(); },
    onError: () => toast.error('Failed to update job area'),
  });

  const loading = create.isPending || update.isPending;

  return (
    <Modal title={area ? 'Edit Job Area' : 'Add Job Area'} onClose={onClose}>
      <Field label="Name">
        <Input value={name} onChange={setName} placeholder="e.g. Engineering" />
      </Field>
      <Field label="Description">
        <Input value={description} onChange={setDescription} placeholder="Optional description" />
      </Field>
      <div className="flex gap-2 justify-end pt-1">
        <CancelBtn onClick={onClose} />
        <SaveBtn
          loading={loading}
          disabled={!name.trim()}
          onClick={() => area ? update.mutate() : create.mutate()}
          label={area ? 'Save Changes' : 'Create Area'}
        />
      </div>
    </Modal>
  );
}

// ─── Family Modal ─────────────────────────────────────────────────────────────

function FamilyModal({ family, jobAreaId, onClose, onSaved }: {
  family?: any; jobAreaId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(family?.name ?? '');

  const create = useMutation({
    mutationFn: () => jobArchitectureService.createJobFamily({ name: name.trim(), jobAreaId: jobAreaId! }),
    onSuccess: () => { toast.success('Job family created'); onSaved(); },
    onError: () => toast.error('Failed to create job family'),
  });

  const update = useMutation({
    mutationFn: () => jobArchitectureService.updateJobFamily(family.id, { name: name.trim() }),
    onSuccess: () => { toast.success('Job family updated'); onSaved(); },
    onError: () => toast.error('Failed to update job family'),
  });

  const loading = create.isPending || update.isPending;

  return (
    <Modal title={family ? 'Edit Job Family' : 'Add Job Family'} onClose={onClose}>
      <Field label="Family Name">
        <Input value={name} onChange={setName} placeholder="e.g. Software Engineering" />
      </Field>
      <div className="flex gap-2 justify-end pt-1">
        <CancelBtn onClick={onClose} />
        <SaveBtn
          loading={loading}
          disabled={!name.trim()}
          onClick={() => family ? update.mutate() : create.mutate()}
          label={family ? 'Save Changes' : 'Create Family'}
        />
      </div>
    </Modal>
  );
}

// ─── Sub-Family Modal ─────────────────────────────────────────────────────────

function SubFamilyModal({ subFamily, jobFamilyId, onClose, onSaved }: {
  subFamily?: any; jobFamilyId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(subFamily?.name ?? '');

  const create = useMutation({
    mutationFn: () => jobArchitectureService.createJobSubFamily({ name: name.trim(), jobFamilyId: jobFamilyId! }),
    onSuccess: () => { toast.success('Sub-family created'); onSaved(); },
    onError: () => toast.error('Failed to create sub-family'),
  });

  const update = useMutation({
    mutationFn: () => jobArchitectureService.updateJobSubFamily(subFamily.id, { name: name.trim() }),
    onSuccess: () => { toast.success('Sub-family updated'); onSaved(); },
    onError: () => toast.error('Failed to update sub-family'),
  });

  const loading = create.isPending || update.isPending;

  return (
    <Modal title={subFamily ? 'Edit Sub-Family' : 'Add Sub-Family'} onClose={onClose}>
      <Field label="Sub-Family Name">
        <Input value={name} onChange={setName} placeholder="e.g. Quality Assurance" />
      </Field>
      <div className="flex gap-2 justify-end pt-1">
        <CancelBtn onClick={onClose} />
        <SaveBtn
          loading={loading}
          disabled={!name.trim()}
          onClick={() => subFamily ? update.mutate() : create.mutate()}
          label={subFamily ? 'Save Changes' : 'Create Sub-Family'}
        />
      </div>
    </Modal>
  );
}

// ─── Job Code Modal ───────────────────────────────────────────────────────────

function JobCodeModal({ jobCode, jobFamilyId, bands, onClose, onSaved }: {
  jobCode?: any; jobFamilyId?: string; bands: any[]; onClose: () => void; onSaved: () => void;
}) {
  const [code, setCode] = useState(jobCode?.code ?? '');
  const [title, setTitle] = useState(jobCode?.title ?? '');
  const [bandId, setBandId] = useState(jobCode?.band?.id ?? bands[0]?.id ?? '');

  const sortedBands = [...bands].sort((a, b) => a.level - b.level);

  const create = useMutation({
    mutationFn: () => jobArchitectureService.createJobCode({
      code: code.trim().toUpperCase(),
      title: title.trim(),
      jobFamilyId: jobFamilyId!,
      bandId,
    }),
    onSuccess: () => { toast.success('Role created'); onSaved(); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to create role'),
  });

  const update = useMutation({
    mutationFn: () => jobArchitectureService.updateJobCode(jobCode.id, {
      code: code.trim().toUpperCase(),
      title: title.trim(),
      bandId,
    }),
    onSuccess: () => { toast.success('Role updated'); onSaved(); },
    onError: () => toast.error('Failed to update role'),
  });

  const loading = create.isPending || update.isPending;

  return (
    <Modal title={jobCode ? 'Edit Role' : 'Add Role'} onClose={onClose}>
      <Field label="Job Code">
        <Input value={code} onChange={setCode} placeholder="e.g. SWE-001" />
      </Field>
      <Field label="Title">
        <Input value={title} onChange={setTitle} placeholder="e.g. Software Engineer" />
      </Field>
      <Field label="Band">
        <select
          value={bandId}
          onChange={e => setBandId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        >
          {sortedBands.map(b => (
            <option key={b.id} value={b.id}>{b.code} — {b.label}</option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2 justify-end pt-1">
        <CancelBtn onClick={onClose} />
        <SaveBtn
          loading={loading}
          disabled={!code.trim() || !title.trim() || !bandId}
          onClick={() => jobCode ? update.mutate() : create.mutate()}
          label={jobCode ? 'Save Changes' : 'Create Role'}
        />
      </div>
    </Modal>
  );
}

// ─── Band Edit Modal ──────────────────────────────────────────────────────────

function BandModal({ band, onClose, onSaved }: {
  band: any; onClose: () => void; onSaved: () => void;
}) {
  const [label, setLabel] = useState(band.label);
  const [isRSU, setIsRSU] = useState(band.isEligibleForRSU);

  const update = useMutation({
    mutationFn: () => jobArchitectureService.updateBand(band.id, { label: label.trim(), isEligibleForRSU: isRSU }),
    onSuccess: () => { toast.success('Band updated'); onSaved(); },
    onError: () => toast.error('Failed to update band'),
  });

  return (
    <Modal title={`Edit Band — ${band.code}`} onClose={onClose}>
      <Field label="Label">
        <Input value={label} onChange={setLabel} placeholder="e.g. Senior Engineer" />
      </Field>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="rsu-eligible"
          checked={isRSU}
          onChange={e => setIsRSU(e.target.checked)}
          className="w-4 h-4 rounded border-input accent-primary"
        />
        <label htmlFor="rsu-eligible" className="text-sm text-foreground select-none cursor-pointer">
          RSU Eligible
        </label>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <CancelBtn onClick={onClose} />
        <SaveBtn
          loading={update.isPending}
          disabled={!label.trim()}
          onClick={() => update.mutate()}
          label="Save Changes"
        />
      </div>
    </Modal>
  );
}

// ─── Job Code Detail Modal ────────────────────────────────────────────────────

const DETAIL_FIELDS = [
  { key: 'jobFunction',           label: 'Job Function'            },
  { key: 'reportsTo',             label: 'Reports To'              },
  { key: 'roleSummary',           label: 'Role Summary'            },
  { key: 'roleResponsibilities',  label: 'Role Responsibilities'   },
  { key: 'managerResponsibility', label: 'Manager Responsibility'  },
  { key: 'educationExperience',   label: 'Education & Experience'  },
  { key: 'skillsRequired',        label: 'Skills Required'         },
] as const;

type DetailKey = typeof DETAIL_FIELDS[number]['key'];

function JobCodeDetailModal({ jc, canEdit, onClose, onSaved }: {
  jc: any; canEdit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Record<DetailKey, string>>({
    jobFunction:           jc.jobFunction           ?? '',
    reportsTo:             jc.reportsTo             ?? '',
    roleSummary:           jc.roleSummary           ?? '',
    roleResponsibilities:  jc.roleResponsibilities  ?? '',
    managerResponsibility: jc.managerResponsibility ?? '',
    educationExperience:   jc.educationExperience   ?? '',
    skillsRequired:        jc.skillsRequired        ?? '',
  });

  const displayTitle   = getCleanTitle(jc.title);
  const embeddedNames  = extractEmployeeNames(jc.title);
  const embeddedName   = embeddedNames.length > 0 ? embeddedNames.join(' ‖ ') : null;

  // Employee management state
  const [linkedEmps, setLinkedEmps]     = useState<any[]>(jc.employees ?? []);
  const [showSearch, setShowSearch]     = useState(false);
  const [empQuery, setEmpQuery]         = useState('');
  const [empResults, setEmpResults]     = useState<any[]>([]);
  const [searching, setSearching]       = useState(false);

  const handleEmpSearch = async (q: string) => {
    setEmpQuery(q);
    if (q.trim().length < 2) { setEmpResults([]); return; }
    setSearching(true);
    try {
      const res = await jobArchitectureService.searchEmployees(q);
      setEmpResults((res as any).data ?? res ?? []);
    } catch { setEmpResults([]); }
    finally { setSearching(false); }
  };

  const update = useMutation({
    mutationFn: () => jobArchitectureService.updateJobCode(jc.id, form),
    onSuccess: () => { toast.success('Role details saved'); setIsEditing(false); onSaved(); },
    onError:   () => toast.error('Failed to save role details'),
  });

  const cleanTitle = useMutation({
    mutationFn: () => jobArchitectureService.updateJobCode(jc.id, { title: displayTitle }),
    onSuccess: () => { toast.success('Title updated'); onSaved(); },
    onError:   () => toast.error('Failed to update title'),
  });

  const unlinkEmp = useMutation({
    mutationFn: (empId: string) => jobArchitectureService.unlinkEmployee(empId),
    onSuccess: (_: any, empId: string) => {
      setLinkedEmps(prev => prev.filter((e: any) => e.id !== empId));
      toast.success('Employee removed');
      // Don't refresh the full hierarchy — only local state changes so the tree order stays stable
    },
    onError: () => toast.error('Failed to remove employee'),
  });

  const linkEmp = useMutation({
    mutationFn: (emp: any) => jobArchitectureService.linkEmployee(emp.id, jc.id),
    onSuccess: (_: any, emp: any) => {
      setLinkedEmps(prev => [...prev, emp]);
      setShowSearch(false); setEmpQuery(''); setEmpResults([]);
      toast.success('Employee added');
      // Don't refresh the full hierarchy — only local state changes so the tree order stays stable
    },
    onError: () => toast.error('Failed to add employee'),
  });

  const hasAnyContent = DETAIL_FIELDS.some(f => jc[f.key]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header — clean title only */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-muted-foreground">{jc.code}</span>
              {jc.band && <BandPill code={jc.band.code} label={jc.band.label} isRSU={jc.band.isEligibleForRSU} />}
              {jc.grade && (
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded border border-border bg-muted/30">
                  {jc.grade.gradeCode}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-foreground mt-1">{displayTitle}</h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Details
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ── Employees Section ── */}
          <div className="rounded-xl border border-border/50 bg-muted/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Employees in this Role
              </p>
              {canEdit && !showSearch && (
                <button
                  onClick={() => setShowSearch(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Employee
                </button>
              )}
            </div>

            {/* Embedded name detected in title — prompt user to clean up */}
            {embeddedName && (
              <div className="rounded-lg border border-amber-300/50 bg-amber-50/40 dark:bg-amber-900/10 px-3 py-2.5 space-y-1.5">
                <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                  Name detected in job title: <strong>{embeddedName}</strong>
                </p>
                <p className="text-[10px] text-amber-600/80 dark:text-amber-500/80">
                  Use "Add Employee" below to properly link this person, then remove from title.
                </p>
                {canEdit && (
                  <button
                    onClick={() => cleanTitle.mutate()}
                    disabled={cleanTitle.isPending}
                    className="text-[10px] text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-300/60 hover:bg-amber-100/60 transition-colors"
                  >
                    {cleanTitle.isPending ? '…' : '× Remove name from title'}
                  </button>
                )}
              </div>
            )}

            {/* DB-linked employees */}
            {linkedEmps.length > 0 ? (
              <div className="space-y-1.5">
                {linkedEmps.map((emp: any) => (
                  <div key={emp.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/40 bg-background shadow-sm">
                    <span
                      className="text-sm font-semibold text-foreground"
                      style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                    >
                      {emp.firstName} {emp.lastName}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => unlinkEmp.mutate(emp.id)}
                        disabled={unlinkEmp.isPending}
                        className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 ml-2"
                        title="Remove from role"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : !embeddedName && (
              <p className="text-xs italic text-muted-foreground/50 text-center py-1">No employees assigned to this role</p>
            )}

            {/* Search to add employee */}
            {showSearch && (
              <div className="space-y-2 pt-1 border-t border-border/30">
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={empQuery}
                    onChange={e => handleEmpSearch(e.target.value)}
                    placeholder="Search employee by name…"
                    className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <button
                    onClick={() => { setShowSearch(false); setEmpQuery(''); setEmpResults([]); }}
                    className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {searching && <p className="text-xs text-muted-foreground text-center py-1">Searching…</p>}
                {empResults.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-border/40 bg-background p-1">
                    {empResults
                      .filter((e: any) => !linkedEmps.some((le: any) => le.id === e.id))
                      .map((emp: any) => (
                        <button
                          key={emp.id}
                          onClick={() => linkEmp.mutate(emp)}
                          disabled={linkEmp.isPending}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-muted/50 text-left text-sm transition-colors"
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-[11px] font-bold text-primary">
                              {emp.firstName?.[0]}{emp.lastName?.[0]}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground text-sm">{emp.firstName} {emp.lastName}</p>
                            {emp.designation && <p className="text-[11px] text-muted-foreground truncate">{emp.designation}</p>}
                          </div>
                        </button>
                      ))}
                  </div>
                )}
                {!searching && empQuery.length >= 2 && empResults.length === 0 && (
                  <p className="text-xs text-muted-foreground/60 text-center py-1">No employees found</p>
                )}
              </div>
            )}
          </div>

          <div className="border-b border-border/40" />

          {/* ── Role Detail Fields ── */}
          {!isEditing && !hasAnyContent && (
            <div className="text-center py-6">
              <Tag className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No role details added yet.</p>
              {canEdit && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" /> Add Details
                </button>
              )}
            </div>
          )}

          {DETAIL_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
              {isEditing ? (
                <textarea
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={`Enter ${label.toLowerCase()}…`}
                  rows={key === 'roleSummary' || key === 'roleResponsibilities' || key === 'managerResponsibility' ? 4 : 2}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              ) : (
                <p className={cn('text-sm leading-relaxed whitespace-pre-wrap', jc[key] ? 'text-foreground' : 'text-muted-foreground/50 italic')}>
                  {jc[key] || 'Not specified'}
                </p>
              )}
              {key !== DETAIL_FIELDS[DETAIL_FIELDS.length - 1].key && !isEditing && (
                <div className="border-b border-border/50 pt-2" />
              )}
            </div>
          ))}
        </div>

        {/* Footer — edit mode only */}
        {isEditing && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border flex-shrink-0 bg-muted/20">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => update.mutate()}
              disabled={update.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save Details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── (tree connector removed — replaced by tab-based navigation) ─────────────

// ─── Employee Detail Modal ────────────────────────────────────────────────────

function EmployeeDetailModal({ employeeId, employeeName, onClose }: {
  employeeId: string | null; employeeName: string; onClose: () => void;
}) {
  const navigate = useNavigate();
  const [emp, setEmp]         = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding]   = useState(false);

  const loadEmployee = async () => {
    setLoading(true); setError(false);
    try {
      if (employeeId) {
        const res: any = await jobArchitectureService.getEmployee(employeeId);
        setEmp(res.data ?? res);
      } else {
        // Search by first name only — backend searches per-field, not full-name concat
        const firstName = employeeName.trim().split(/\s+/)[0];
        const res: any = await jobArchitectureService.searchEmployees(firstName);
        const list: any[] = res.data ?? res ?? [];
        // Then match full name client-side
        const exact = list.find((e: any) =>
          `${e.firstName} ${e.lastName}`.toLowerCase() === employeeName.toLowerCase()
        );
        // Fallback: partial last-name match
        const partial = !exact ? list.find((e: any) =>
          e.lastName?.toLowerCase() === employeeName.split(/\s+/).pop()?.toLowerCase()
        ) : null;
        setEmp(exact ?? partial ?? null);
      }
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadEmployee(); }, [employeeId, employeeName]);

  const initials = emp
    ? `${emp.firstName?.[0] ?? ''}${emp.lastName?.[0] ?? ''}`.toUpperCase()
    : employeeName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground text-sm">Employee Profile</h3>
            <div className="flex items-center gap-2">
              {emp && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-5 space-y-4">
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading profile…</p>
              </div>
            ) : error ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-sm font-medium text-foreground">{employeeName}</p>
                <p className="text-xs text-muted-foreground">Failed to load profile. Check your connection.</p>
              </div>
            ) : !emp ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto">
                  <span className="text-base font-bold text-muted-foreground">
                    {employeeName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground"
                     style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                    {employeeName}
                  </p>
                  <p className="text-xs text-muted-foreground">Not found in Employee Directory.</p>
                </div>
                <button
                  onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add to Employee Directory
                </button>
              </div>
            ) : (
              <>
                {/* Avatar + name */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold text-primary">{initials}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-foreground leading-tight"
                       style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                      {emp.firstName} {emp.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">{emp.designation ?? '—'}</p>
                  </div>
                </div>

                <div className="border-t border-border/40" />

                {/* Key fields — same data as Employee Directory */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {[
                    { label: 'Employee ID',   value: emp.employeeId },
                    { label: 'Band',          value: emp.band },
                    { label: 'Department',    value: emp.department },
                    { label: 'Work Mode',     value: emp.workMode?.replace('_', ' ') },
                    { label: 'Email',         value: emp.email, full: true },
                    { label: 'Status',        value: emp.employmentStatus },
                    { label: 'Work Location', value: emp.workLocation ?? emp.location },
                    { label: 'Gender',        value: emp.gender?.replace(/_/g, ' ') },
                    { label: 'Grade',         value: emp.grade },
                    { label: 'Date of Joining', value: emp.dateOfJoining ? new Date(emp.dateOfJoining).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null },
                  ].filter(f => f.value).map(({ label, value, full }) => (
                    <div key={label} className={full ? 'col-span-2' : ''}>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
                      <p className="text-sm text-foreground mt-0.5 truncate">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  {emp.id && (
                    <button
                      onClick={() => { onClose(); navigate(`/employees/${emp.id}`); }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      View Full Profile <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit existing employee — same form as Employee Directory */}
      {editing && emp && (
        <AddEmployeeModal
          open={editing}
          onClose={() => { setEditing(false); loadEmployee(); }}
          prefill={{
            id: emp.id,
            firstName: emp.firstName,
            lastName: emp.lastName,
            email: emp.email,
            gender: emp.gender,
            dateOfJoining: emp.dateOfJoining?.split('T')[0],
            department: emp.department,
            designation: emp.designation,
            band: emp.band,
            grade: emp.grade,
            workMode: emp.workMode,
            workLocation: emp.workLocation,
            annualFixed: Number(emp.annualFixed),
          }}
        />
      )}

      {/* Add new employee — name pre-filled from the job-title box */}
      {adding && (
        <AddEmployeeModal
          open={adding}
          onClose={() => { setAdding(false); loadEmployee(); }}
          prefill={{
            firstName: employeeName.trim().split(/\s+/)[0] ?? '',
            lastName:  employeeName.trim().split(/\s+/).slice(1).join(' ') ?? '',
          }}
        />
      )}
    </>
  );
}

// ─── Employee Tag (inline clickable chip inside a role row) ──────────────────

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-orange-500',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const sz = size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-7 h-7 text-[10px]';
  return (
    <span className={cn(sz, 'rounded-full flex items-center justify-center font-bold text-white flex-shrink-0', avatarColor(name))}>
      {initials}
    </span>
  );
}

function EmployeeTag({ name, employeeId }: { name: string; employeeId: string | null }) {
  const [showDetail, setShowDetail] = useState(false);
  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setShowDetail(true); }}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
      >
        <Avatar name={name} size="sm" />
        <span className="text-xs font-medium text-foreground truncate">{name}</span>
      </button>
      {showDetail && (
        <EmployeeDetailModal employeeId={employeeId} employeeName={name} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}

function EmployeeAvatarStack({ emps }: { emps: { id: string | null; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [detailEmp, setDetailEmp] = useState<{ id: string | null; name: string } | null>(null);
  const MAX_VISIBLE = 4;
  const visible = emps.slice(0, MAX_VISIBLE);
  const overflow = emps.length - MAX_VISIBLE;

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            title={`${emps.length} employee${emps.length !== 1 ? 's' : ''}`}
          >
            {/* Overlapping avatar stack */}
            <div className="flex -space-x-2">
              {visible.map(emp => (
                <span key={emp.name} className="ring-2 ring-background rounded-full">
                  <Avatar name={emp.name} size="sm" />
                </span>
              ))}
            </div>
            {overflow > 0 && (
              <span className="text-[10px] font-semibold text-muted-foreground bg-muted border border-border rounded-full px-1.5 py-0.5">
                +{overflow}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground font-medium">
              {emps.length} {emps.length === 1 ? 'person' : 'people'}
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="right"
            align="start"
            sideOffset={8}
            onClick={e => e.stopPropagation()}
            className="z-50 w-56 rounded-xl border border-border bg-background shadow-xl overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {emps.length} {emps.length === 1 ? 'Employee' : 'Employees'}
              </span>
              <Popover.Close className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </Popover.Close>
            </div>
            <div className="py-1 max-h-64 overflow-y-auto">
              {emps.map(emp => (
                <EmployeeTag key={emp.name} name={emp.name} employeeId={emp.id} />
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {detailEmp && (
        <EmployeeDetailModal employeeId={detailEmp.id} employeeName={detailEmp.name} onClose={() => setDetailEmp(null)} />
      )}
    </>
  );
}

// ─── Role Row (horizontal row with employee tags and Vacant state) ────────────

function RoleRow({ jc, bands, editMode, canEdit, onRefresh }: {
  jc: any; bands: any[]; editMode: boolean; canEdit: boolean; onRefresh: () => void;
}) {
  const [modal, setModal] = useState<'detail' | 'edit' | 'delete' | null>(null);
  const displayTitle = jc.title;
  type EmpEntry = { id: string | null; name: string };
  const allEmps: EmpEntry[] = (jc.employees ?? []).map((e: any) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }));
  const isVacant = allEmps.length === 0;

  const del = useMutation({
    mutationFn: () => jobArchitectureService.deleteJobCode(jc.id),
    onSuccess: () => { toast.success('Role deleted'); onRefresh(); setModal(null); },
    onError: () => toast.error('Failed to delete role'),
  });

  return (
    <>
      <div
        className="group flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-muted/30 border border-transparent hover:border-border/30 transition-all cursor-pointer"
        onClick={() => setModal('detail')}
      >
        <div className="flex items-center gap-2 flex-shrink-0 w-[190px] min-w-0">
          {jc.band && <BandPill code={jc.band.code} label={jc.band.label} isRSU={jc.band.isEligibleForRSU} />}
        </div>
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground flex-1 min-w-0 leading-snug">{displayTitle}</span>
          <div className="flex-shrink-0 w-[190px]" onClick={e => e.stopPropagation()}>
            {isVacant ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] italic text-muted-foreground/55 px-2.5 py-1 rounded-full border border-dashed border-border/40 bg-muted/15">
                <span className="w-1.5 h-1.5 rounded-full bg-border/50 flex-shrink-0" />Vacant
              </span>
            ) : (
              <EmployeeAvatarStack emps={allEmps} />
            )}
          </div>
        </div>
        {editMode && (
          <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button onClick={() => setModal('edit')} className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => setModal('delete')} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      {modal === 'detail' && <JobCodeDetailModal jc={jc} canEdit={canEdit} onClose={() => setModal(null)} onSaved={() => { setModal(null); onRefresh(); }} />}
      {modal === 'edit' && <JobCodeModal jobCode={jc} bands={bands} onClose={() => setModal(null)} onSaved={() => { setModal(null); onRefresh(); }} />}
      {modal === 'delete' && <DeleteConfirm label={`${jc.code} — ${jc.title}`} onConfirm={() => del.mutate()} onCancel={() => setModal(null)} loading={del.isPending} />}
    </>
  );
}

// ─── Add Role Modal (sub-family aware) ───────────────────────────────────────

function AddRoleModal({ familyId, subFamilyId, bands, onClose, onSaved }: {
  familyId: string; subFamilyId: string | null; bands: any[];
  onClose: () => void; onSaved: () => void;
}) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [bandId, setBandId] = useState(bands[0]?.id ?? '');

  const sortedBands = [...bands].sort((a, b) => a.level - b.level);

  const create = useMutation({
    mutationFn: () => jobArchitectureService.createJobCode({
      code: code.trim().toUpperCase(),
      title: title.trim(),
      jobFamilyId: familyId,
      bandId,
      ...(subFamilyId ? { jobSubFamilyId: subFamilyId } : {}),
    } as any),
    onSuccess: () => { toast.success('Role created'); onSaved(); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to create role'),
  });

  return (
    <Modal title="Add Role" onClose={onClose}>
      <Field label="Job Code">
        <Input value={code} onChange={setCode} placeholder="e.g. SWE-001" />
      </Field>
      <Field label="Title">
        <Input value={title} onChange={setTitle} placeholder="e.g. Software Engineer" />
      </Field>
      <Field label="Band">
        <select
          value={bandId}
          onChange={e => setBandId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        >
          {sortedBands.map(b => (
            <option key={b.id} value={b.id}>{b.code} — {b.label}</option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2 justify-end pt-1">
        <CancelBtn onClick={onClose} />
        <SaveBtn
          loading={create.isPending}
          disabled={!code.trim() || !title.trim() || !bandId}
          onClick={() => create.mutate()}
          label="Create Role"
        />
      </div>
    </Modal>
  );
}

// ─── Area Section (family tabs + sub-family tabs + role column layout) ────────

function AreaSection({ area, accentColor, colorClass, search, bands, editMode, canEdit, onRefresh }: {
  area: any; accentColor: string; colorClass: string; search: string; bands: any[];
  editMode: boolean; canEdit: boolean; onRefresh: () => void;
}) {
  const families: any[] = area.jobFamilies ?? [];
  const [open, setOpen] = useState(true);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [selectedSubFamilyId, setSelectedSubFamilyId] = useState<string | null>(null);
  const [modal, setModal] = useState<'edit' | 'delete' | 'add-family' | null>(null);
  const [familyAction, setFamilyAction] = useState<{ type: 'edit' | 'delete'; family: any } | null>(null);
  const [subFamilyAction, setSubFamilyAction] = useState<{ type: 'edit' | 'delete'; subFamily: any } | null>(null);
  const [addSubFamilyForFamily, setAddSubFamilyForFamily] = useState<string | null>(null);
  const [addRoleForSubFamily, setAddRoleForSubFamily] = useState<{ familyId: string; subFamilyId: string | null } | null>(null);

  // Count roles including sub-family roles
  const countFamilyRoles = (f: any): number => {
    const directRoles = (f.jobCodes ?? []).length;
    const subRoles = (f.jobSubFamilies ?? []).reduce((s: number, sub: any) => s + (sub.jobCodes ?? []).length, 0);
    return directRoles + subRoles;
  };

  const countFamilyVacant = (f: any): number => {
    const isVacant = (jc: any) => extractEmployeeNames(jc.title).length === 0 && (jc.employees ?? []).length === 0;
    const directVacant = (f.jobCodes ?? []).filter(isVacant).length;
    const subVacant = (f.jobSubFamilies ?? []).reduce((s: number, sub: any) =>
      s + (sub.jobCodes ?? []).filter(isVacant).length, 0);
    return directVacant + subVacant;
  };

  const totalRoles = families.reduce((s: number, f: any) => s + countFamilyRoles(f), 0);
  const totalVacant = families.reduce((s: number, f: any) => s + countFamilyVacant(f), 0);

  const visibleFamilies = search
    ? families.filter(f => {
        const directMatch = f.name.toLowerCase().includes(search.toLowerCase()) ||
          (f.jobCodes ?? []).some((jc: any) =>
            jc.title.toLowerCase().includes(search.toLowerCase()) ||
            jc.code.toLowerCase().includes(search.toLowerCase())
          );
        const subMatch = (f.jobSubFamilies ?? []).some((sub: any) =>
          sub.name.toLowerCase().includes(search.toLowerCase()) ||
          (sub.jobCodes ?? []).some((jc: any) =>
            jc.title.toLowerCase().includes(search.toLowerCase()) ||
            jc.code.toLowerCase().includes(search.toLowerCase())
          )
        );
        return directMatch || subMatch;
      })
    : families;

  const effectiveId = (selectedFamilyId && visibleFamilies.find((f: any) => f.id === selectedFamilyId))
    ? selectedFamilyId
    : visibleFamilies[0]?.id ?? null;

  const selectedFamily = families.find((f: any) => f.id === effectiveId) ?? null;

  // Sub-families for the selected family
  const subFamilies: any[] = selectedFamily?.jobSubFamilies ?? [];
  const hasSubFamilies = subFamilies.length > 0;

  // Effective sub-family id: reset when family changes
  const effectiveSubId = hasSubFamilies
    ? ((selectedSubFamilyId && subFamilies.find((s: any) => s.id === selectedSubFamilyId))
        ? selectedSubFamilyId
        : subFamilies[0]?.id ?? null)
    : null;

  const selectedSubFamily = hasSubFamilies
    ? (subFamilies.find((s: any) => s.id === effectiveSubId) ?? null)
    : null;

  // Determine which roles to show
  const getRolesToShow = (): any[] => {
    if (!selectedFamily) return [];
    let roles: any[];
    if (hasSubFamilies && selectedSubFamily) {
      roles = [...(selectedSubFamily.jobCodes ?? [])];
    } else if (!hasSubFamilies) {
      roles = [...(selectedFamily.jobCodes ?? [])];
    } else {
      roles = [];
    }
    return roles
      .sort((a: any, b: any) => {
        const aL = a.band?.level ?? 9999, bL = b.band?.level ?? 9999;
        return aL !== bL ? aL - bL : a.code.localeCompare(b.code);
      })
      .filter((jc: any) =>
        !search ||
        jc.title.toLowerCase().includes(search.toLowerCase()) ||
        jc.code.toLowerCase().includes(search.toLowerCase())
      );
  };

  const sortedRoles = getRolesToShow();

  const del = useMutation({
    mutationFn: () => jobArchitectureService.deleteJobArea(area.id),
    onSuccess: () => { toast.success('Job area deleted'); onRefresh(); setModal(null); },
    onError: () => toast.error('Failed to delete job area'),
  });
  const delFamily = useMutation({
    mutationFn: (id: string) => jobArchitectureService.deleteJobFamily(id),
    onSuccess: () => { toast.success('Family deleted'); onRefresh(); setFamilyAction(null); },
    onError: () => toast.error('Failed to delete family'),
  });
  const delSubFamily = useMutation({
    mutationFn: (id: string) => jobArchitectureService.deleteJobSubFamily(id),
    onSuccess: () => { toast.success('Sub-family deleted'); onRefresh(); setSubFamilyAction(null); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to delete sub-family'),
  });

  return (
    <>
      <div className={cn('rounded-xl border bg-card overflow-hidden shadow-sm', editMode ? 'border-primary/30' : 'border-border')}>
        <div className="flex">
          <div className="w-1 flex-shrink-0" style={{ backgroundColor: accentColor }} />
          <div className="flex-1 min-w-0 flex items-center gap-3 px-4 py-4">
            <button onClick={() => setOpen(o => !o)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', colorClass)}>
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground text-base leading-tight">{area.name}</h3>
                {area.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{area.description}</p>}
              </div>
              <div className="text-right flex-shrink-0 mr-2 space-y-0.5">
                <p className="text-xs text-muted-foreground">{families.length} {families.length === 1 ? 'family' : 'families'} · {totalRoles} roles</p>
                {totalVacant > 0 && <p className="text-xs text-amber-600/80">{totalVacant} vacant</p>}
              </div>
            </button>
            {editMode && (
              <div className="flex items-center gap-1.5 flex-shrink-0 border-l border-border pl-3">
                <button onClick={() => { setModal('add-family'); setOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Family
                </button>
                <button onClick={() => setModal('edit')} className="p-1.5 rounded-lg bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => setModal('delete')} className="p-1.5 rounded-lg bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            )}
            <button onClick={() => setOpen(o => !o)} className="flex-shrink-0 pl-1">
              {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-border/40 bg-muted/5">
            {visibleFamilies.length > 0 ? (
              <>
                {/* Family tabs row */}
                <div className="flex items-center gap-2 px-5 py-3 overflow-x-auto border-b border-border/30 bg-background/60 flex-wrap">
                  {visibleFamilies.map((family: any) => {
                    const isActive = family.id === effectiveId;
                    const roleCount = countFamilyRoles(family);
                    const vacantCount = countFamilyVacant(family);
                    return (
                      <div key={family.id} className="relative group/tab flex-shrink-0">
                        <button
                          onClick={() => { setSelectedFamilyId(family.id); setSelectedSubFamilyId(null); }}
                          className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all whitespace-nowrap',
                            isActive ? 'text-white shadow-sm' : 'bg-card border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                          )}
                          style={isActive ? { backgroundColor: accentColor, borderColor: accentColor } : {}}
                        >
                          <Briefcase className="w-3.5 h-3.5 flex-shrink-0 opacity-75" />
                          <span>{family.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                                style={isActive ? { backgroundColor: 'rgba(255,255,255,0.25)', color: 'white' } : { backgroundColor: `${accentColor}15`, color: accentColor }}>
                            {roleCount}
                          </span>
                          {vacantCount > 0 && (
                            <span className={cn('text-[9px] px-1 py-0.5 rounded font-medium flex-shrink-0',
                              isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400')}>
                              {vacantCount} vacant
                            </span>
                          )}
                        </button>
                        {editMode && (
                          <div className="absolute -top-1 -right-1 hidden group-hover/tab:flex gap-0.5 z-10">
                            <button onClick={e => { e.stopPropagation(); setFamilyAction({ type: 'edit', family }); }} className="w-5 h-5 rounded bg-primary text-white flex items-center justify-center hover:bg-primary/80 shadow-sm"><Pencil className="w-2.5 h-2.5" /></button>
                            <button onClick={e => { e.stopPropagation(); setFamilyAction({ type: 'delete', family }); }} className="w-5 h-5 rounded bg-destructive text-white flex items-center justify-center hover:bg-destructive/80 shadow-sm"><Trash2 className="w-2.5 h-2.5" /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Sub-family tabs row — always shown for selected family (add button even when empty) */}
                {selectedFamily && (hasSubFamilies || editMode) && (
                  <div className="flex items-center gap-2 px-5 py-3 overflow-x-auto border-b border-border/40 bg-muted/10 flex-wrap">
                    {subFamilies.map((sub: any) => {
                      const isActive = sub.id === effectiveSubId;
                      const roleCount = (sub.jobCodes ?? []).length;
                      return (
                        <div key={sub.id} className="relative group/subtab flex-shrink-0">
                          <button
                            onClick={() => setSelectedSubFamilyId(sub.id)}
                            className={cn(
                              'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all whitespace-nowrap',
                              isActive
                                ? 'text-white shadow-sm'
                                : 'bg-card border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                            )}
                            style={isActive ? { backgroundColor: accentColor, borderColor: accentColor, opacity: 0.85 } : {}}
                          >
                            <Tag className="w-3 h-3 flex-shrink-0 opacity-75" />
                            <span>{sub.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                                  style={isActive ? { backgroundColor: 'rgba(255,255,255,0.25)', color: 'white' } : { backgroundColor: `${accentColor}15`, color: accentColor }}>
                              {roleCount}
                            </span>
                          </button>
                          {editMode && (
                            <div className="absolute -top-1 -right-1 hidden group-hover/subtab:flex gap-0.5 z-10">
                              <button onClick={e => { e.stopPropagation(); setSubFamilyAction({ type: 'edit', subFamily: sub }); }} className="w-5 h-5 rounded bg-primary text-white flex items-center justify-center hover:bg-primary/80 shadow-sm"><Pencil className="w-2.5 h-2.5" /></button>
                              <button onClick={e => { e.stopPropagation(); setSubFamilyAction({ type: 'delete', subFamily: sub }); }} className="w-5 h-5 rounded bg-destructive text-white flex items-center justify-center hover:bg-destructive/80 shadow-sm"><Trash2 className="w-2.5 h-2.5" /></button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {editMode && (
                      <button
                        onClick={() => setAddSubFamilyForFamily(selectedFamily.id)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all flex-shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Sub-Family
                      </button>
                    )}
                  </div>
                )}

                {/* Role column under selected family / sub-family */}
                {selectedFamily && (
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-4 px-4 py-2 mb-1 border-b border-border/30">
                      <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider w-[190px] flex-shrink-0">Band / Code</span>
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider flex-1">Designation / Role</span>
                        <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider w-[190px] flex-shrink-0">Employees</span>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      {sortedRoles.length === 0 ? (
                        <p className="text-sm italic text-muted-foreground/50 text-center py-8">
                          {hasSubFamilies && selectedSubFamily ? `No roles in ${selectedSubFamily.name}` : 'No roles in this family'}
                        </p>
                      ) : (
                        sortedRoles.map((jc: any) => (
                          <RoleRow key={jc.id} jc={jc} bands={bands} editMode={editMode} canEdit={canEdit} onRefresh={onRefresh} />
                        ))
                      )}
                    </div>
                    {editMode && (
                      <button
                        onClick={() => setAddRoleForSubFamily({
                          familyId: selectedFamily.id,
                          subFamilyId: hasSubFamilies && selectedSubFamily ? selectedSubFamily.id : null,
                        })}
                        className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border/50 text-sm text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all w-full justify-center"
                      >
                        <Plus className="w-4 h-4" /> Add Role{hasSubFamilies && selectedSubFamily ? ` to ${selectedSubFamily.name}` : ` to ${selectedFamily.name}`}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : search ? (
              <p className="text-sm text-muted-foreground text-center py-8">No matches found</p>
            ) : (
              <p className="text-xs italic text-muted-foreground/50 text-center py-6">No families defined yet</p>
            )}
          </div>
        )}
      </div>

      {modal === 'edit' && <AreaModal area={area} onClose={() => setModal(null)} onSaved={() => { setModal(null); onRefresh(); }} />}
      {modal === 'delete' && <DeleteConfirm label={area.name} onConfirm={() => del.mutate()} onCancel={() => setModal(null)} loading={del.isPending} />}
      {modal === 'add-family' && <FamilyModal jobAreaId={area.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); onRefresh(); }} />}
      {familyAction?.type === 'edit' && <FamilyModal family={familyAction.family} onClose={() => setFamilyAction(null)} onSaved={() => { setFamilyAction(null); onRefresh(); }} />}
      {familyAction?.type === 'delete' && <DeleteConfirm label={familyAction.family.name} onConfirm={() => delFamily.mutate(familyAction.family.id)} onCancel={() => setFamilyAction(null)} loading={delFamily.isPending} />}
      {subFamilyAction?.type === 'edit' && <SubFamilyModal subFamily={subFamilyAction.subFamily} onClose={() => setSubFamilyAction(null)} onSaved={() => { setSubFamilyAction(null); onRefresh(); }} />}
      {subFamilyAction?.type === 'delete' && <DeleteConfirm label={subFamilyAction.subFamily.name} onConfirm={() => delSubFamily.mutate(subFamilyAction.subFamily.id)} onCancel={() => setSubFamilyAction(null)} loading={delSubFamily.isPending} />}
      {addSubFamilyForFamily && <SubFamilyModal jobFamilyId={addSubFamilyForFamily} onClose={() => setAddSubFamilyForFamily(null)} onSaved={() => { setAddSubFamilyForFamily(null); onRefresh(); }} />}
      {addRoleForSubFamily && (
        <AddRoleModal
          familyId={addRoleForSubFamily.familyId}
          subFamilyId={addRoleForSubFamily.subFamilyId}
          bands={bands}
          onClose={() => setAddRoleForSubFamily(null)}
          onSaved={() => { setAddRoleForSubFamily(null); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JobArchitecturePage() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'bands' | 'employees'>('hierarchy');
  const [editMode, setEditMode] = useState(false);
  const [bandModal, setBandModal] = useState<any>(null);
  const [areaModal, setAreaModal] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [importEmployeesOpen, setImportEmployeesOpen] = useState(false);

  const user = useAuthStore(s => s.user);
  const canEdit = user?.role === 'ADMIN' || user?.role === 'HR_MANAGER';

  // Exit edit mode when switching tabs
  const handleTabChange = (tab: 'hierarchy' | 'bands' | 'employees') => {
    setActiveTab(tab);
    setEditMode(false);
  };

  const qc = useQueryClient();

  const refreshHierarchy = () => {
    qc.invalidateQueries({ queryKey: queryKeys.jobArchitecture.hierarchy });
  };
  const refreshBands = () => {
    qc.invalidateQueries({ queryKey: queryKeys.jobArchitecture.bands });
    qc.invalidateQueries({ queryKey: queryKeys.jobArchitecture.hierarchy });
  };

  const { data: hierarchyData, isLoading: hierarchyLoading } = useQuery({
    queryKey: queryKeys.jobArchitecture.hierarchy,
    queryFn: jobArchitectureService.getHierarchy,
    staleTime: STALE_TIMES.LONG,
  });

  const { data: bandsData, isLoading: bandsLoading } = useQuery({
    queryKey: queryKeys.jobArchitecture.bands,
    queryFn: jobArchitectureService.getBands,
    staleTime: STALE_TIMES.LONG,
  });

  const areas: any[] = hierarchyData?.data ?? [];
  const bands: any[] = bandsData?.data ?? [];

  const totalFamilies = areas.reduce((s, a) => s + (a.jobFamilies?.length ?? 0), 0);
  const totalRoles = areas.reduce((s, a) =>
    s + (a.jobFamilies ?? []).reduce((fs: number, f: any) => {
      const direct = f.jobCodes?.length ?? 0;
      const subRoles = (f.jobSubFamilies ?? []).reduce(
        (ss: number, sub: any) => ss + (sub.jobCodes?.length ?? 0), 0
      );
      return fs + direct + subRoles;
    }, 0), 0);

  const totalSubFamilies = areas.reduce((s, a) =>
    s + (a.jobFamilies ?? []).reduce((fs: number, f: any) => fs + (f.jobSubFamilies?.length ?? 0), 0), 0);

  const filteredAreas = search
    ? areas.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        (a.jobFamilies ?? []).some((f: any) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          (f.jobCodes ?? []).some((jc: any) =>
            jc.title.toLowerCase().includes(search.toLowerCase()) ||
            jc.code.toLowerCase().includes(search.toLowerCase())
          )
        )
      )
    : areas;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Job Architecture</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage job areas, families, bands and roles
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {editMode && activeTab === 'hierarchy' && (
              <button
                onClick={() => setAreaModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Area
              </button>
            )}
            <button
              onClick={() => setBulkImportOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              <Upload className="w-4 h-4" />
              Bulk Import
            </button>
            <button
              onClick={() => setEditMode(e => !e)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                editMode
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {editMode
                ? <><CheckCheck className="w-4 h-4" /> Done Editing</>
                : <><Pencil className="w-4 h-4" /> Edit Architecture</>
              }
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: 'Job Areas', value: areas.length, icon: Building2, color: 'text-blue-500' },
          { label: 'Job Families', value: totalFamilies, icon: Briefcase, color: 'text-violet-500' },
          { label: 'Sub Job Families', value: totalSubFamilies, icon: FolderOpen, color: 'text-cyan-500' },
          { label: 'Total Roles', value: totalRoles, icon: Tag, color: 'text-emerald-500' },
          { label: 'Bands', value: bands.length, icon: Layers, color: 'text-amber-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('w-4 h-4', color)} />
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {hierarchyLoading || bandsLoading
                ? <span className="inline-block w-8 h-6 bg-muted/60 rounded animate-pulse" />
                : value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/40 border border-border w-fit">
        {(['hierarchy', 'bands', 'employees'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              activeTab === tab
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'hierarchy' ? 'Hierarchy' : tab === 'bands' ? 'Band Structure' : 'Employees'}
          </button>
        ))}
      </div>

      {/* Edit mode banner */}
      {editMode && activeTab !== 'employees' && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/8 border border-primary/20 text-sm text-primary">
          <Pencil className="w-4 h-4 flex-shrink-0" />
          <span>Edit mode is on — make changes below, then click <strong>Done Editing</strong> when finished.</span>
        </div>
      )}

      {/* Hierarchy Tab */}
      {activeTab === 'hierarchy' && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search areas, families, roles..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {hierarchyLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-muted/60 animate-pulse" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-muted/60 rounded w-1/4 animate-pulse" />
                      <div className="h-3 bg-muted/40 rounded w-1/3 animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredAreas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-16 text-center">
              <Layers className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? `No results for "${search}"` : 'No job areas yet'}
              </p>
              {canEdit && !search && (
                <button
                  onClick={() => { setAreaModal(true); setEditMode(true); }}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add First Job Area
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAreas.map((area: any, idx: number) => (
                <AreaSection
                  key={area.id}
                  area={area}
                  colorClass={AREA_COLORS[idx % AREA_COLORS.length]}
                  accentColor={AREA_ACCENT_COLORS[idx % AREA_ACCENT_COLORS.length]}
                  search={search}
                  bands={bands}
                  editMode={editMode}
                  canEdit={canEdit}
                  onRefresh={refreshHierarchy}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Band Structure Tab */}
      {activeTab === 'bands' && (
        <div className="space-y-3">
          {bandsLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl border border-border bg-card animate-pulse" />
            ))
          ) : (
            [...bands]
              .sort((a, b) => a.level - b.level)
              .map((band: any) => (
                <div
                  key={band.id}
                  className="flex items-center gap-4 px-5 py-4 rounded-xl border border-border bg-card hover:bg-muted/20 transition-colors"
                >
                  <div className="w-12 flex-shrink-0">
                    <BandPill code={band.code} label={band.label} isRSU={band.isEligibleForRSU} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{band.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Level {band.level}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {band.isEligibleForRSU && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                        <Star className="w-3 h-3 fill-current" />
                        RSU Eligible
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {areas.reduce((count, a) =>
                        count + (a.jobFamilies ?? []).reduce((fc: number, f: any) => {
                          const direct = (f.jobCodes ?? []).filter((jc: any) => jc.band?.code === band.code).length;
                          const subRoles = (f.jobSubFamilies ?? []).reduce((sc: number, sub: any) =>
                            sc + (sub.jobCodes ?? []).filter((jc: any) => jc.band?.code === band.code).length, 0);
                          return fc + direct + subRoles;
                        }, 0), 0
                      )} roles
                    </span>
                    {editMode && (
                      <button
                        onClick={() => setBandModal(band)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary text-xs font-medium transition-colors"
                        title="Edit band"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              ))
          )}

          <p className="text-xs text-muted-foreground text-center pt-2 flex items-center justify-center gap-1">
            <Star className="w-3 h-3 text-amber-500 fill-current" />
            Bands marked with a star are eligible for RSU grants
          </p>
        </div>
      )}

      {/* Employees Tab */}
      {activeTab === 'employees' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <button
              onClick={() => setImportEmployeesOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import Employees
            </button>
          </div>
          <EmployeeDirectoryPage />
        </div>
      )}

      {/* Global modals */}
      {areaModal && (
        <AreaModal
          onClose={() => setAreaModal(false)}
          onSaved={() => { setAreaModal(false); refreshHierarchy(); }}
        />
      )}
      {bandModal && (
        <BandModal
          band={bandModal}
          onClose={() => setBandModal(null)}
          onSaved={() => { setBandModal(null); refreshBands(); }}
        />
      )}
      <BulkImportJobArchModal
        open={bulkImportOpen}
        onClose={() => { setBulkImportOpen(false); refreshHierarchy(); }}
      />
      <ImportEmployeesModal
        open={importEmployeesOpen}
        onClose={() => setImportEmployeesOpen(false)}
      />

    </div>
  );
}
