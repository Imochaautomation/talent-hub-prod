import { useState, useRef } from 'react';
import { FileText, Sparkles, Printer, RefreshCw, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';
import { getValidToken } from '../lib/streamAuth';

interface Section {
  title: string;
  content: string;
  done: boolean;
}

const SECTION_TITLES = [
  'Compensation Health Overview',
  'Critical Issues Requiring Immediate Action',
  'Pay Equity Analysis',
  'Compensation Strategy Recommendation',
  '30-Day HR Action Plan',
];

const SECTION_ICONS = ['📊', '🚨', '⚖️', '💡', '📋'];

export default function LeadershipReportPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [currentSection, setCurrentSection] = useState<number>(-1);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generateReport = async () => {
    // Reset state
    setSections([]);
    setCurrentSection(-1);
    setDone(false);
    setError(null);
    setGenerating(true);

    abortRef.current = new AbortController();

    try {
      const token = await getValidToken();
      const response = await fetch('/api/ai/report/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: abortRef.current.signal,
      });

      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buf += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const blocks = buf.split('\n\n');
        buf = blocks.pop() ?? '';

        for (const block of blocks) {
          if (!block.trim() || block.startsWith(':')) continue;

          const lines = block.split('\n');
          let eventType = 'message';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr += line.slice(6);
          }

          if (!dataStr) continue;
          let payload: any;
          try { payload = JSON.parse(dataStr); } catch { continue; }

          if (eventType === 'section_start') {
            const idx = payload.index as number;
            setCurrentSection(idx);
            setSections(prev => {
              const next = [...prev];
              next[idx] = { title: payload.title, content: '', done: false };
              return next;
            });
          } else if (eventType === 'text') {
            // Sections stream in parallel — route delta by index when present,
            // fall back to last section for backwards compatibility with older
            // sequential responses.
            setSections(prev => {
              const next = [...prev];
              const target = typeof payload.index === 'number' ? payload.index : next.length - 1;
              if (target >= 0 && next[target]) {
                next[target] = { ...next[target], content: next[target].content + (payload.delta ?? '') };
              }
              return next;
            });
          } else if (eventType === 'section_end') {
            const idx = payload.index as number;
            setSections(prev => {
              const next = [...prev];
              if (next[idx]) next[idx] = { ...next[idx], done: true };
              return next;
            });
          } else if (eventType === 'done') {
            setDone(true);
            setCurrentSection(-1);
          } else if (eventType === 'error') {
            setError(payload.message || 'Report generation failed');
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Report generation failed');
      }
    } finally {
      setGenerating(false);
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    setGenerating(false);
  };

  const handlePrint = () => window.print();

  const progress = sections.filter(s => s.done).length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Leadership Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            AI-generated executive compensation briefing — board-ready in ~45 seconds
          </p>
        </div>
        <div className="flex items-center gap-2">
          {done && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors print:hidden"
            >
              <Printer className="w-4 h-4" />
              Print / PDF
            </button>
          )}
          <button
            onClick={generating ? stopGeneration : generateReport}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors print:hidden',
              generating
                ? 'bg-red-600/10 text-red-600 border border-red-200 hover:bg-red-600/20'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {generating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                Stop
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {done ? 'Regenerate' : 'Generate Report'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress bar — visible while generating */}
      {generating && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 print:hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-primary">
              {currentSection >= 0
                ? `Analyzing: ${SECTION_TITLES[currentSection]} (${currentSection + 1}/${SECTION_TITLES.length})`
                : 'Gathering live org data…'}
            </span>
            <span className="text-xs text-muted-foreground">{progress}/{SECTION_TITLES.length} sections</span>
          </div>
          <div className="h-1.5 bg-primary/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(progress / SECTION_TITLES.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!generating && sections.length === 0 && !error && (
        <div className="rounded-xl border border-border bg-card py-20 flex flex-col items-center justify-center text-center">
          <FileText className="w-12 h-12 text-muted-foreground/20 mb-4" />
          <p className="text-base font-medium text-foreground mb-1">Ready to generate your leadership briefing</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Claude will analyze your live compensation data and produce a 5-section executive report
            covering pay equity, critical issues, and a 30-day action plan.
          </p>
          <div className="mt-6 grid grid-cols-5 gap-2">
            {SECTION_TITLES.map((title, i) => (
              <div key={i} className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                <span className="text-lg">{SECTION_ICONS[i]}</span>
                <span className="text-center leading-tight">{title.split(' ').slice(0, 2).join(' ')}</span>
              </div>
            ))}
          </div>
          <button
            onClick={generateReport}
            className="mt-8 flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate Report
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 p-4 flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Report generation failed</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">{error}</p>
          </div>
          <button onClick={generateReport} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 underline">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* ── Report content — print-optimized ── */}
      {sections.length > 0 && (
        <div className="space-y-6 print:space-y-8">
          {/* Print header */}
          <div className="hidden print:block border-b-2 border-gray-800 pb-4 mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Compensation Leadership Briefing</h1>
            <p className="text-sm text-gray-500 mt-1">Generated by CompSense AI — {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>

          {sections.map((section, i) => (
            <div
              key={i}
              className={cn(
                'rounded-xl border bg-card transition-all duration-300 print:border-gray-200 print:rounded-none',
                section.done ? 'border-border' : 'border-primary/30 shadow-sm shadow-primary/10'
              )}
            >
              {/* Section header */}
              <div className={cn(
                'flex items-center gap-3 px-5 py-4 border-b print:border-gray-200',
                section.done ? 'border-border' : 'border-primary/20'
              )}>
                <span className="text-xl">{SECTION_ICONS[i]}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Section {i + 1} of {SECTION_TITLES.length}</span>
                    {!section.done && generating && (
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                    {section.done && <ChevronRight className="w-3.5 h-3.5 text-green-500" />}
                  </div>
                  <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
                </div>
              </div>

              {/* Section body */}
              <div className="px-6 py-5">
                {section.content ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert text-foreground
                    prose-headings:text-foreground prose-strong:text-foreground
                    prose-p:text-foreground/90 prose-li:text-foreground/90
                    print:prose-p:text-gray-800 print:prose-li:text-gray-800">
                    <ReactMarkdown>{section.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="h-6 w-48 bg-muted/40 rounded animate-pulse" />
                )}
              </div>
            </div>
          ))}

          {/* Footer when done */}
          {done && (
            <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/10 p-4 flex items-center gap-3 print:hidden">
              <Sparkles className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-400">
                Report complete — based on live data from {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.
                Use the <strong>Print / PDF</strong> button to export for board presentation.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
