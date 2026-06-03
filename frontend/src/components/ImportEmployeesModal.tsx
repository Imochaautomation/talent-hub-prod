import { useState, useRef, useEffect } from 'react';
import { Upload, Download, CheckCircle2, XCircle, Loader2, X, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';

interface ImportProgress { processed: number; total: number; }
interface ImportComplete { imported: number; updated?: number; failed?: number; errors: { row: number; message: string }[]; }

interface Props {
  /** When true, renders as a page section rather than a floating modal */
  inline?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export default function ImportEmployeesModal({ inline = false, open, onClose }: Props) {
  const [mode, setMode] = useState<'upsert' | 'replace'>('upsert');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importComplete, setImportComplete] = useState<ImportComplete | null>(null);
  const [asyncMessage, setAsyncMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) return;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const onProgress = (data: ImportProgress) => { setProgress(data); setProcessing(true); };
    const onComplete = (data: ImportComplete) => {
      setProcessing(false);
      setProgress(null);
      setImportComplete(data);
      if (inputRef.current) inputRef.current.value = '';
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => setImportComplete(null), 6000);
    };

    const attach = () => {
      const socket = getSocket();
      if (!socket) { retryTimer = setTimeout(attach, 300); return; }
      socket.on('import:progress', onProgress);
      socket.on('import:complete', onComplete);
    };
    attach();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      const socket = getSocket();
      if (socket) {
        socket.off('import:progress', onProgress);
        socket.off('import:complete', onComplete);
      }
    };
  }, [isAuthenticated]);

  // Reset when modal opens (non-inline mode only)
  useEffect(() => {
    if (!inline && open) {
      setMode('upsert');
      setUploading(false);
      setUploadPct(0);
      setProcessing(false);
      setProgress(null);
      setImportComplete(null);
      setAsyncMessage(null);
    }
  }, [inline, open]);

  if (!inline && !open) return null;

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadPct(0);
    setImportComplete(null);
    setAsyncMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await api.post(`/import/employees?mode=${mode}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: controller.signal,
        onUploadProgress: (e) => {
          if (e.total) setUploadPct(Math.round((e.loaded / e.total) * 100));
        },
      });
      setAsyncMessage(res.data?.message ?? `Processing ${res.data?.total ?? ''} employees…`);
      setProcessing(true);
      toast.success('File uploaded — processing in background');
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED') return;
      toast.error(err?.response?.data?.error?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      setUploadPct(0);
      abortControllerRef.current = null;
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    setUploading(false);
    setUploadPct(0);
  };

  const body = (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        {(['upsert', 'replace'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              mode === m
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            {m === 'upsert' ? 'Add / Update' : 'Replace All'}
          </button>
        ))}
      </div>

      {mode === 'replace' && (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <strong>Warning:</strong> Replace All deletes all existing employee records before importing.
        </p>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && !processing && inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 cursor-pointer transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/40',
          (uploading || processing) && 'pointer-events-none opacity-60'
        )}
      >
        <Upload className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Drop a CSV or Excel file here</p>
        <p className="text-xs text-muted-foreground">or click to browse — up to 5,000 rows</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Uploading… {uploadPct}%</span>
            <button onClick={handleCancel} className="text-destructive hover:underline">Cancel</button>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${uploadPct}%` }} />
          </div>
        </div>
      )}

      {/* Processing progress */}
      {processing && progress && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Processing {progress.processed} / {progress.total} rows…</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.round((progress.processed / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {processing && !progress && asyncMessage && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{asyncMessage}</span>
        </div>
      )}

      {/* Completion result */}
      {importComplete && (
        <div className={cn(
          'rounded-lg border px-4 py-3 text-sm',
          importComplete.failed
            ? 'border-destructive/30 bg-destructive/5 text-destructive'
            : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
        )}>
          <div className="flex items-center gap-2 font-medium mb-1">
            {importComplete.failed ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            Import complete
          </div>
          <p className="text-xs">
            {importComplete.imported} imported
            {importComplete.updated ? `, ${importComplete.updated} updated` : ''}
            {importComplete.failed ? `, ${importComplete.failed} failed` : ''}
          </p>
          {importComplete.errors?.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs max-h-28 overflow-y-auto">
              {importComplete.errors.map((e, i) => (
                <li key={i}>Row {e.row}: {e.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Template download */}
      <button
        onClick={() => window.open('/api/import/template', '_blank')}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Download employee import template (.csv)
      </button>
    </div>
  );

  // ── Inline (tab) mode ─────────────────────────────────────────────────────────
  if (inline) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 max-w-lg">
        <div className="flex items-center gap-2 mb-5">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Import Employees</h3>
        </div>
        {body}
      </div>
    );
  }

  // ── Modal (overlay) mode ──────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Import Employees</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{body}</div>
      </div>
    </div>
  );
}
