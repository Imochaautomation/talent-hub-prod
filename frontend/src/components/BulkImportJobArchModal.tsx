import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload, Download, X, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, FileSpreadsheet, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { jobArchitectureService } from '../services/jobArchitecture.service';
import { queryKeys } from '../lib/queryClient';

type Step = 'upload' | 'preview' | 'result';
type Mode = 'add_new' | 'replace';

interface PreviewData {
  parsedCount: number;
  toCreate: { type: string; name: string; details?: Record<string, unknown> }[];
  toUpdate: { type: string; name: string; existing: Record<string, unknown>; incoming: Record<string, unknown> }[];
  unchanged: number;
  errors: { row: number; sheet: string; message: string }[];
  employeeLinksCount: number;
  previewToken: string;
}

interface ResultData {
  created: number;
  updated: number;
  skipped: number;
  employeesLinked: number;
  errors: { row: number; sheet: string; message: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

function Section({
  label, count, color, children, defaultOpen = false,
}: {
  label: string; count: number; color: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className={cn('w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-left hover:bg-muted/40 transition-colors', color)}
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
        <span>{label}</span>
        <span className="ml-auto bg-background/60 px-2 py-0.5 rounded-full text-xs">{count}</span>
      </button>
      {open && <div className="border-t border-border bg-muted/20">{children}</div>}
    </div>
  );
}

export default function BulkImportJobArchModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [mode, setMode] = useState<Mode>('add_new');

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setResult(null);
    setMode('add_new');
    setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const pickFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('Please upload an Excel (.xlsx / .xls) or CSV file.');
      return;
    }
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, []);

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const data = await jobArchitectureService.previewBulkImport(file);
      // Guard: ensure the response has the expected shape
      if (!data || typeof data !== 'object' || !Array.isArray((data as any).toCreate)) {
        toast.error('Unexpected response from server. Please try again.');
        return;
      }
      setPreview(data);
      setStep('preview');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Failed to parse file.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const data = await jobArchitectureService.applyBulkImport(preview.previewToken, mode);
      setResult(data);
      setStep('result');
      qc.invalidateQueries({ queryKey: queryKeys.jobArchitecture.hierarchy });
      qc.invalidateQueries({ queryKey: ['employees'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Import failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Bulk Import Job Architecture</h2>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-0 px-6 pt-4 pb-2 shrink-0">
          {(['upload', 'preview', 'result'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors',
                step === s ? 'border-primary bg-primary text-primary-foreground' :
                  (i < ['upload', 'preview', 'result'].indexOf(step) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'),
              )}>{i + 1}</div>
              {i < 2 && <div className={cn('w-12 h-0.5 mx-1', i < ['upload', 'preview', 'result'].indexOf(step) ? 'bg-primary' : 'bg-border')} />}
            </div>
          ))}
          <span className="ml-3 text-xs text-muted-foreground capitalize">{step}</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <>
              <p className="text-sm text-muted-foreground">
                Upload an Excel file with your job architecture data. Supports detail-row format (one role per row) and matrix/grid format (band × role stream grid).
              </p>

              <div
                ref={dropRef}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
                )}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                {file ? (
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium">Drop your Excel or CSV file here</p>
                    <p className="text-xs text-muted-foreground mt-1">or click to browse · .xlsx, .xls, .csv</p>
                  </div>
                )}
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted/40 border border-border rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">Need the correct format?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Download the template — it includes instructions, example rows for multiple departments, and a band code reference.</p>
                </div>
                <button
                  onClick={() => jobArchitectureService.downloadImportTemplate()}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg bg-background hover:bg-muted transition-colors shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Template
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: Preview ── */}
          {step === 'preview' && preview && (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-5 gap-2 text-center">
                {[
                  { label: 'Parsed', value: preview.parsedCount ?? 0, color: 'text-foreground' },
                  { label: 'New', value: (preview.toCreate ?? []).length, color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Conflicts', value: (preview.toUpdate ?? []).length, color: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Emp. Links', value: preview.employeeLinksCount ?? 0, color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'Errors', value: (preview.errors ?? []).length, color: 'text-red-600 dark:text-red-400' },
                ].map(item => (
                  <div key={item.label} className="bg-muted/40 rounded-lg py-2 px-1">
                    <div className={cn('text-xl font-bold', item.color)}>{item.value}</div>
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>

              {(preview.unchanged ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground text-center">{preview.unchanged} item(s) already match — will be skipped.</p>
              )}
              {(preview.employeeLinksCount ?? 0) > 0 && (
                <p className="text-xs text-blue-600 dark:text-blue-400 text-center bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg py-2 px-3">
                  {preview.employeeLinksCount} employee record(s) found — designation, department, salary and grade will be updated, and each will be linked to their matching job code.
                </p>
              )}

              {/* Mode selector (only shown when there are conflicts) */}
              {(preview.toUpdate ?? []).length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">
                    {preview.toUpdate.length} item(s) already exist with different data. How should we handle them?
                  </p>
                  <div className="flex gap-2">
                    {(['add_new', 'replace'] as Mode[]).map(m => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={cn(
                          'flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors',
                          mode === m
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-background border-amber-200 dark:border-amber-700 text-muted-foreground hover:border-amber-400',
                        )}
                      >
                        {m === 'add_new' ? 'Skip existing' : 'Replace existing'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Expandable sections */}
              <div className="space-y-2">
                <Section label="New items to create" count={(preview.toCreate ?? []).length} color="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20">
                  <div className="divide-y divide-border">
                    {(preview.toCreate ?? []).map((item, i) => (
                      <div key={i} className="px-4 py-2 flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground w-20 shrink-0">{item.type}</span>
                        <span className="font-medium">{item.name}</span>
                        {item.details?.jobArea != null && (
                          <span className="text-muted-foreground">in {String(item.details.jobArea)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>

                <Section label="Conflicts (existing with different data)" count={(preview.toUpdate ?? []).length} color="text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20" defaultOpen>
                  <div className="divide-y divide-border">
                    {(preview.toUpdate ?? []).map((item, i) => (
                      <div key={i} className="px-4 py-3 text-xs">
                        <div className="font-medium mb-1">{item.name} <span className="text-muted-foreground font-normal">({item.type})</span></div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-muted-foreground mb-0.5">Current</div>
                            {Object.entries(item.existing).map(([k, v]) => v != null && (
                              <div key={k} className="text-muted-foreground truncate">{k}: {String(v)}</div>
                            ))}
                          </div>
                          <div>
                            <div className="text-muted-foreground mb-0.5">Incoming</div>
                            {Object.entries(item.incoming).map(([k, v]) => v != null && (
                              <div key={k} className="truncate">{k}: {String(v)}</div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section label="Parse errors" count={(preview.errors ?? []).length} color="text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20" defaultOpen>
                  <div className="divide-y divide-border">
                    {(preview.errors ?? []).map((e, i) => (
                      <div key={i} className="px-4 py-2 text-xs flex items-center gap-2">
                        <span className="text-muted-foreground shrink-0">{e.sheet} row {e.row}</span>
                        <span className="text-red-600 dark:text-red-400">{e.message}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
            </>
          )}

          {/* ── Step 3: Result ── */}
          {step === 'result' && result && (
            <div className="text-center py-6 space-y-4">
              {result.errors.length === 0 ? (
                <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
              ) : (
                <AlertTriangle className="w-14 h-14 mx-auto text-amber-500" />
              )}
              <h3 className="text-base font-semibold">
                {result.errors.length === 0 ? 'Import complete!' : 'Import finished with errors'}
              </h3>
              <div className="flex justify-center gap-6 text-sm">
                <div><span className="font-bold text-emerald-600 dark:text-emerald-400">{result.created}</span><br /><span className="text-muted-foreground">created</span></div>
                <div><span className="font-bold text-violet-600 dark:text-violet-400">{result.updated}</span><br /><span className="text-muted-foreground">updated</span></div>
                <div><span className="font-bold text-muted-foreground">{result.skipped}</span><br /><span className="text-muted-foreground">skipped</span></div>
                {(result.employeesLinked ?? 0) > 0 && (
                  <div><span className="font-bold text-blue-600 dark:text-blue-400">{result.employeesLinked}</span><br /><span className="text-muted-foreground">emp. linked</span></div>
                )}
                {result.errors.length > 0 && (
                  <div><span className="font-bold text-red-600 dark:text-red-400">{result.errors.length}</span><br /><span className="text-muted-foreground">errors</span></div>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="text-left bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-xs space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex gap-2">
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{e.sheet} row {e.row}:</span>
                      <span>{e.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 gap-3">
          <button onClick={handleClose} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {step === 'result' ? 'Close' : 'Cancel'}
          </button>

          <div className="flex gap-2">
            {step === 'preview' && (
              <button
                onClick={() => { setStep('upload'); setPreview(null); }}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Back
              </button>
            )}
            {step === 'upload' && (
              <button
                onClick={handlePreview}
                disabled={!file || loading}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {loading ? 'Uploading…' : 'Upload & Preview'}
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleApply}
                disabled={loading || ((preview?.toCreate ?? []).length === 0 && (preview?.toUpdate ?? []).length === 0 && (preview?.employeeLinksCount ?? 0) === 0)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Apply Import
              </button>
            )}
            {step === 'result' && (
              <button
                onClick={() => { reset(); }}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Import Another
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
