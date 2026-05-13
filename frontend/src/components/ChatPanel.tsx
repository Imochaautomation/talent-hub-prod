/**
 * ChatPanel — Floating AI chat available on every page.
 * Uses SSE streaming from POST /api/ai/chat/stream.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Trash2, ChevronDown, Loader2, Bot, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { getValidToken } from '../lib/streamAuth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  activeTools?: string[];
  error?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  get_org_summary:              'Analysing organisation overview…',
  get_employees:                'Querying employee data…',
  get_pay_equity_data:          'Analysing pay equity…',
  get_band_analysis:            'Checking salary bands…',
  get_performance_pay_alignment:'Analysing performance-pay alignment…',
  get_benefits_data:            'Fetching benefits data…',
  get_variable_pay:             'Analysing variable pay…',
  run_scenario:                 'Running compensation scenario…',
};

const STARTERS = [
  'Who is most underpaid in Engineering?',
  'What would a 10% raise for all P2s cost?',
  'Show me gender pay gap by department',
  'Which high performers have a low compa-ratio?',
  'Give me an org summary',
];

function parseSSE(chunk: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  const lines = chunk.split('\n');
  let event = '';
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) { event = line.slice(7).trim(); }
    else if (line.startsWith('data: ')) { data = line.slice(6).trim(); }
    else if (line === '' && event) {
      try { events.push({ event, data: JSON.parse(data) as any }); } catch { /* ignore */ }
      event = ''; data = '';
    }
  }
  return events;
}

export function ChatPanel() {
  const [isOpen, setIsOpen]       = useState(false);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 200);
  }, [isOpen]);

  const sendMessage = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || streaming) return;

    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setStreaming(true);

    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true, activeTools: [] }]);

    const token = await getValidToken();
    const ctrl  = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg }),
        signal: ctrl.signal,
      });

      if (resp.status === 401) { window.location.href = '/login'; return; }
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines (split on double newline)
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line || line.startsWith(':')) continue; // keep-alive comment
          const evtMatch  = line.match(/^event: (.+)/m);
          const dataMatch = line.match(/^data: (.+)/m);
          if (!evtMatch || !dataMatch) continue;
          const evt  = evtMatch[1];
          const data = JSON.parse(dataMatch[1]);

          if (evt === 'text') {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + data.text };
              return msgs;
            });
          } else if (evt === 'tool') {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'assistant') {
                const tools = [...(last.activeTools || [])];
                if (!tools.includes(data.toolName)) tools.push(data.toolName);
                msgs[msgs.length - 1] = { ...last, activeTools: tools };
              }
              return msgs;
            });
          } else if (evt === 'done') {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, isStreaming: false, activeTools: [] };
              return msgs;
            });
            setStreaming(false);
          } else if (evt === 'error') {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: `Error: ${data.message}`, isStreaming: false, error: true };
              return msgs;
            });
            setStreaming(false);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last?.role === 'assistant') {
            msgs[msgs.length - 1] = { ...last, content: 'Connection error. Please try again.', isStreaming: false, error: true };
          }
          return msgs;
        });
        setStreaming(false);
      }
    }
  }, [streaming, messages.length]);

  const clearChat = async () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    const token = sessionStorage.getItem('accessToken');
    await fetch('/api/ai/chat/history', {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className={cn(
          'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          isOpen && 'rotate-90 opacity-0 pointer-events-none'
        )}
        aria-label="Open AI Chat"
      >
        <Sparkles className="w-6 h-6" />
      </button>

      {/* Panel */}
      <div className={cn(
        'fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl border border-border bg-background overflow-hidden transition-all duration-300 origin-bottom-right',
        isOpen ? 'w-[400px] h-[580px] opacity-100 scale-100' : 'w-14 h-14 opacity-0 scale-75 pointer-events-none'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground leading-none">AI Assistant</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Powered by Claude</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Clear conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Ask about your org's compensation</p>
                <p className="text-xs text-muted-foreground mt-1">I'll query live data to answer</p>
              </div>
              <div className="w-full space-y-1.5">
                {STARTERS.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-border/50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              <div className={cn(
                'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-sm'
                  : msg.error
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-tl-sm'
                  : 'bg-muted/50 text-foreground border border-border/50 rounded-tl-sm'
              )}>
                {/* Tool call indicators */}
                {msg.activeTools && msg.activeTools.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {msg.activeTools.map(tool => (
                      <div key={tool} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {TOOL_LABELS[tool] || tool}
                      </div>
                    ))}
                  </div>
                )}
                {msg.content ? (
                  msg.role === 'assistant' ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h3: ({ children }) => <p className="text-xs font-bold text-foreground mt-2 mb-1">{children}</p>,
                        h4: ({ children }) => <p className="text-xs font-semibold text-foreground mt-1.5 mb-0.5">{children}</p>,
                        p:  ({ children }) => <p className="text-sm leading-relaxed mb-1 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        hr: () => <hr className="border-border my-2" />,
                        ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 text-sm mb-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 text-sm mb-1">{children}</ol>,
                        li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-2 rounded-lg border border-border">
                            <table className="w-full text-xs border-collapse">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
                        tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
                        tr: ({ children }) => <tr className="divide-x divide-border">{children}</tr>,
                        th: ({ children }) => <th className="px-2 py-1.5 text-left font-semibold text-foreground">{children}</th>,
                        td: ({ children }) => <td className="px-2 py-1.5 text-muted-foreground">{children}</td>,
                        code: ({ children }) => <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">{children}</code>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  )
                ) : msg.isStreaming ? (
                  <span className="inline-flex gap-0.5 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                  </span>
                ) : null}
                {msg.isStreaming && msg.content && (
                  <span className="inline-block w-0.5 h-3.5 bg-primary/70 animate-pulse ml-0.5 align-text-bottom" />
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 p-3 border-t border-border bg-card">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about compensation data…"
              disabled={streaming}
              className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || streaming}
              className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-primary/90 transition-colors"
            >
              {streaming ? <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" /> : <Send className="w-3.5 h-3.5 text-primary-foreground" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
