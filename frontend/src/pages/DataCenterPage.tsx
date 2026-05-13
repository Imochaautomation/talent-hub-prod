import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, Users, Gift, CheckCircle2, XCircle, Loader2, FileSpreadsheet, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';

interface UploadResult {
  imported?: number;
  updated?: number;
  errors?: { row: number; message: string }[];
  // employee import returns a message (async)
  message?: string;
  total?: number;
}

interface ImportProgress { processed: number; total: number; }
interface ImportComplete { imported: number; updated?: number; failed?: number; errors: { row: number; message: string }[]; }

interface UploadCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  templateLabel: string;
  templateHref: string;
  uploadEndpoint: string;
  acceptModes?: boolean;
  progressEvent?: string;
  completeEvent?: string;
  onUploadComplete?: () => void;
}

function UploadCard({
  title,
  description,
  icon: Icon,
  templateLabel,
  templateHref,
  uploadEndpoint,
  acceptModes = false,
  progressEvent,
  completeEvent,
  onUploadComplete,
}: UploadCardProps) {
  const [mode, setMode] = useState<'upsert' | 'replace'>('upsert');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importComplete, setImportComplete] = useState<ImportComplete | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isAuthenticated } = useAuthStore();

  // Subscribe to socket events — retry until socket is available (it's initialised
  // by useSocket() in AppShell whose effect runs after children, so getSocket()
  // may return null on the first render).
  useEffect(() => {
    if (!progressEvent || !completeEvent || !isAuthenticated) return;

    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const onProgress = (data: ImportProgress) => {
      setProgress(data);
      setProcessing(true);
    };

    const onComplete = (data: ImportComplete) => {
      setProcessing(false);
      setProgress(null);
      setImportComplete(data);
      // Clear the file input so the same file can be re-selected on the next upload
      if (inputRef.current) inputRef.current.value = '';
      onUploadComplete?.();
      // Auto-clear the completion banner after 6 seconds
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        setResult(null);
        setImportComplete(null);
      }, 6000);
    };

    const attach = () => {
      const socket = getSocket();
      if (!socket) {
        retryTimer = setTimeout(attach, 300);
        return;
      }
      socket.on(progressEvent, onProgress);
      socket.on(completeEvent, onComplete);
    };

    attach();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      const socket = getSocket();
      if (socket) {
        socket.off(progressEvent, onProgress);
        socket.off(completeEvent, onComplete);
      }
    };
  }, [progressEvent, completeEvent, isAuthenticated]);

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get(templateHref, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      // filename from content-disposition or fallback
      const cd = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : 'template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download template');
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    setUploading(false);
    setProcessing(false);
    setProgress(null);
    setResult(null);
    setImportComplete(null);
    if (inputRef.current) inputRef.current.value = '';
    toast.info('Upload cancelled');
  };

  const upload = async (file: File) => {
    abortControllerRef.current = new AbortController();
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    setUploading(true);
    setUploadPct(0);
    setResult(null);
    setProcessing(false);
    setProgress(null);
    setImportComplete(null);
    const uploadStartedAt = Date.now();
    try {
      const formData = new FormData();
      formData.append('file', file);
      const url = acceptModes ? `${uploadEndpoint}?mode=${mode}` : uploadEndpoint;
      const res = await api.post(url, formData, {
        signal: abortControllerRef.current.signal,
        onUploadProgress: (e) => {
          if (e.total) setUploadPct(Math.round((e.loaded / e.total) * 100));
          else if (e.loaded) setUploadPct(99);
        },
      });
      setUploadPct(100);
      // Hold the 100% bar long enough to be perceptible — Vite proxies the
      // upload over loopback so small files complete in <100ms.
      const elapsed = Date.now() - uploadStartedAt;
      if (elapsed < 800) await new Promise(r => setTimeout(r, 800 - elapsed));
      const data: UploadResult = res.data?.data ?? res.data;
      setResult(data);
      if (data.message) {
        // Async (202) — processing happens in background; socket events will update the card
        setProcessing(true);
        toast.success('File received', { description: 'Processing in background — progress will appear below.' });
      } else {
        onUploadComplete?.();
        const { imported = 0, updated = 0, errors = [] } = data;
        if (errors.length === 0) {
          toast.success(`Upload complete — ${imported} added, ${updated} updated`);
        } else {
          toast.warning(`Upload done with ${errors.length} error${errors.length !== 1 ? 's' : ''}`);
        }
      }
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return; // user cancelled — no toast
      const msg = err?.response?.data?.error?.message ?? 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
      abortControllerRef.current = null;
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
      toast.error('Only CSV and Excel files are accepted');
      return;
    }
    upload(file);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        {(uploading || processing) && (
          <button
            onClick={handleCancel}
            title="Cancel upload"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            {uploading ? 'Cancel Upload' : 'Stop'}
          </button>
        )}
      </div>

      {acceptModes && (
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 w-fit">
          {(['upsert', 'replace'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-all',
                mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m === 'upsert' ? 'Add / Update' : 'Replace All'}
            </button>
          ))}
        </div>
      )}
      {acceptModes && mode === 'replace' && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 -mt-2">
          Replace mode will delete ALL existing records of this type before importing.
        </p>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all',
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
          uploading && 'pointer-events-none opacity-60'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0])}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-3 w-full max-w-md mx-auto">
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <p className="text-sm font-medium text-foreground tabular-nums">Uploading… {uploadPct}%</p>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-150"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Drop your file here or click to browse</p>
            <p className="text-xs text-muted-foreground">Supports .csv, .xlsx, .xls — max 10 MB</p>
          </div>
        )}
      </div>

      {/* Result summary */}
      {result && !result.message && (
        <div className="space-y-2">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              {result.imported ?? 0} added
            </span>
            <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="w-4 h-4" />
              {result.updated ?? 0} updated
            </span>
            {(result.errors?.length ?? 0) > 0 && (
              <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <XCircle className="w-4 h-4" />
                {result.errors!.length} error{result.errors!.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1.5">Row errors:</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400">
                  Row {e.row}: {e.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Async result — shows while processing or after completion */}
      {result?.message && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            {result.message}
          </p>

          {/* Waiting for first socket event */}
          {processing && !progress && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>Processing records in the background…</span>
            </div>
          )}

          {/* Live progress bar */}
          {processing && progress && progress.total > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  Processing…
                </span>
                <span className="font-medium text-foreground tabular-nums">
                  {progress.processed} / {progress.total}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.round((progress.processed / progress.total) * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground text-right">
                {Math.round((progress.processed / progress.total) * 100)}% complete
              </p>
            </div>
          )}

          {/* Completion summary */}
          {!processing && importComplete && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  {importComplete.imported} added
                </span>
                {(importComplete.updated ?? 0) > 0 && (
                  <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    {importComplete.updated} updated
                  </span>
                )}
                {(importComplete.failed ?? 0) > 0 && (
                  <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                    <XCircle className="w-4 h-4" />
                    {importComplete.failed} failed
                  </span>
                )}
              </div>
              {importComplete.errors && importComplete.errors.length > 0 && (
                <div className="rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2 max-h-32 overflow-y-auto">
                  {importComplete.errors.slice(0, 10).map((e, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                  {importComplete.errors.length > 10 && (
                    <p className="text-xs text-muted-foreground mt-1">…and {importComplete.errors.length - 10} more</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Template download */}
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <p className="text-xs text-muted-foreground">Need the template?</p>
        <button
          onClick={handleDownloadTemplate}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {templateLabel}
        </button>
      </div>
    </div>
  );
}

export default function DataCenterPage() {
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  const handleExportFullReport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/export/full-report', { responseType: 'blob' });
      const dateStr = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `talenthub-export-${dateStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Failed to generate report');
    } finally {
      setExporting(false);
    }
  };

  const { data: catalogRaw } = useQuery({
    queryKey: ['benefits', 'catalog'],
    queryFn: () => api.get('/benefits/catalog').then(r => r.data?.data ?? []),
    staleTime: 10 * 60 * 1000,
    enabled: isAuthenticated,
  });
  const benefitNames: string[] = Array.isArray(catalogRaw)
    ? catalogRaw.map((b: any) => b.name as string)
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Center</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload employee and benefits data from Excel or CSV files
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <strong>Note:</strong> "Add / Update" mode upserts records without touching others.
          "Replace All" mode deletes <em>all</em> existing records of that type before importing — use with caution.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <UploadCard
          title="Employee Data"
          description="Upload employee records in Zoho Compensation Details format (.csv or .xlsx). Supports up to 5,000 rows per upload."
          icon={Users}
          templateLabel="Download Employee Template"
          templateHref="/import/template"
          uploadEndpoint="/import/employees"
          acceptModes
          progressEvent="import:progress"
          completeEvent="import:complete"
        />
        <UploadCard
          title="Benefits & RSU Data"
          description="Upload employee benefit enrollments and RSU utilization data. Matches employees by Employee ID and benefits by name."
          icon={Gift}
          templateLabel="Download Benefits Template"
          templateHref="/import/benefits/template"
          uploadEndpoint="/import/benefits"
          acceptModes
          progressEvent="benefits:import:progress"
          completeEvent="benefits:import:complete"
          onUploadComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['benefits'] });
          }}
        />
      </div>

      {/* Export Full Report */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" />
              Export Full Report
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Download an Excel workbook with all employee, compensation, and benefits data
              plus an AI-generated summary for each section — useful as a timestamped archive
              before uploading a fresh data file.
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground list-disc list-inside">
              <li>Sheet 1 — AI Summary (People · Compensation · Benefits)</li>
              <li>Sheet 2 — All Employees (every field, all statuses)</li>
              <li>Sheet 3 — Compensation Rollup (Band × Department)</li>
              <li>Sheet 4 — Benefits Enrollments (Active · Expired · Claimed)</li>
            </ul>
          </div>
          <button
            onClick={handleExportFullReport}
            disabled={exporting}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Generate &amp; Download
              </>
            )}
          </button>
        </div>
      </div>

      {/* Reference card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Valid Benefit Names</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          The Benefit Name column in your file must match one of these exactly (case-insensitive):
        </p>
        <div className="flex flex-wrap gap-2">
          {benefitNames.length > 0
            ? benefitNames.map(name => (
                <span key={name} className="px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground font-mono">
                  {name}
                </span>
              ))
            : <span className="text-xs text-muted-foreground italic">Loading…</span>
          }
        </div>
      </div>
    </div>
  );
}
