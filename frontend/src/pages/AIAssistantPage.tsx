/**
 * AI Assistant — Full-page conversational interface.
 * Route: /ai-assistant
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, Trash2, Bot, User, Loader2, Info, Clock, MessageSquare, X, ChevronLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { getValidToken } from '../lib/streamAuth';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  activeTools?: string[];
  error?: boolean;
}

interface SessionMeta {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  messageCount: number;
}

const TOOL_LABELS: Record<string, string> = {
  get_org_summary:              'Analysing organisation overview…',
  get_employees:                'Querying employee data…',
  get_pay_equity_data:          'Analysing pay equity data…',
  get_band_analysis:            'Checking salary band structure…',
  get_performance_pay_alignment:'Analysing performance-pay alignment…',
  get_benefits_data:            'Fetching benefits utilisation data…',
  run_scenario:                 'Running compensation scenario…',
};

// Custom renderers for ReactMarkdown — gives precise styling over every element
const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  // Paragraphs
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,

  // Headings
  h1: ({ children }) => (
    <h1 className="text-sm font-bold text-foreground mt-3 mb-1.5 first:mt-0 pb-1 border-b border-border/50">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-semibold text-foreground mt-3 mb-1 first:mt-0 flex items-center gap-1.5">
      <span className="w-1 h-3.5 rounded-full bg-primary inline-block flex-shrink-0" />
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2 mb-1 first:mt-0">{children}</h3>
  ),

  // Lists
  ul: ({ children }) => <ul className="my-1.5 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 space-y-0.5 list-none counter-reset-[item]">{children}</ol>,
  li: ({ children, ...props }) => {
    const isOrdered = (props as any).ordered;
    return (
      <li className="flex items-start gap-2 text-sm leading-relaxed">
        <span className={cn(
          'flex-shrink-0 mt-1.5 rounded-full',
          isOrdered
            ? 'w-4 h-4 bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center'
            : 'w-1.5 h-1.5 bg-primary/60'
        )}>
          {isOrdered ? (props as any).index + 1 : null}
        </span>
        <span className="flex-1">{children}</span>
      </li>
    );
  },

  // Inline formatting
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic text-xs">
      {children}
    </blockquote>
  ),

  // HR
  hr: () => <hr className="border-border my-3" />,

  // Inline code
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) return <code className="text-xs font-mono text-foreground">{children}</code>;
    return (
      <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono text-foreground border border-border/40">
        {children}
      </code>
    );
  },

  // Code block
  pre: ({ children }) => (
    <pre className="bg-muted/80 border border-border/50 rounded-lg p-3 overflow-x-auto my-2 text-xs font-mono">
      {children}
    </pre>
  ),

  // Table — the main improvement: scrollable, styled, striped
  table: ({ children }) => (
    <div className="overflow-x-auto my-3 rounded-lg border border-border/60 shadow-sm">
      <table className="w-full border-collapse text-xs">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/70 border-b border-border">
      {children}
    </thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border/40">
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => {
    const isHeader = (props as any).isHeader;
    return (
      <tr className={cn(!isHeader && 'hover:bg-muted/30 transition-colors')}>
        {children}
      </tr>
    );
  },
  th: ({ children }) => (
    <th className="text-left px-3 py-2 font-semibold text-foreground whitespace-nowrap tracking-wide text-[11px] uppercase">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-foreground/90 whitespace-nowrap">
      {children}
    </td>
  ),
};

const STARTERS = [
  { label: 'Pay equity overview', prompt: 'Give me a full pay equity analysis — overall gender gap, which departments are worst, and your top 2 recommendations.' },
  { label: 'Underpaid top performers', prompt: 'Who are our high performers (rating ≥ 4) who are being paid below 90% compa-ratio? List them with names and departments.' },
  { label: 'Scenario: 10% raise for P2', prompt: 'What would a 10% salary increase for all P2 band employees cost? And how does that affect our total payroll percentage?' },
  { label: 'Band compliance audit', prompt: 'Which employees are outside their salary band? Show me a band-by-band breakdown of how many are below/within/above.' },
  { label: 'Attrition risk by pay', prompt: 'Which departments have the most employees with a compa-ratio below 80%? These are our highest flight-risk employees.' },
  { label: 'Benefits utilisation', prompt: 'Which benefits have the lowest utilisation? What benefits are employees actually using?' },
];

function parseSSEBuffer(buffer: string): Array<{ event: string; data: any }> {
  const results: Array<{ event: string; data: any }> = [];
  const blocks = buffer.split('\n\n');
  for (const block of blocks) {
    if (!block.trim() || block.startsWith(':')) continue;
    const evtMatch  = block.match(/^event: (.+)/m);
    const dataMatch = block.match(/^data: (.+)/m);
    if (evtMatch && dataMatch) {
      try { results.push({ event: evtMatch[1], data: JSON.parse(dataMatch[1]) }); } catch { /* skip */ }
    }
  }
  return results;
}

// Convert Anthropic MessageParam[] from Redis into display Message[]
function historyToMessages(history: any[]): Message[] {
  const result: Message[] = [];
  for (const msg of history) {
    const role = msg.role as 'user' | 'assistant';
    // Skip tool_result user turns (internal plumbing, not user-visible)
    if (role === 'user' && Array.isArray(msg.content) && msg.content[0]?.type === 'tool_result') continue;

    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
    }
    if (text.trim()) result.push({ role, content: text });
  }
  return result;
}

export default function AIAssistantPage() {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sessions, setSessions]   = useState<SessionMeta[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [viewingSession, setViewingSession] = useState<{ meta: SessionMeta; messages: Message[] } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Load persisted history from Redis on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const token = sessionStorage.getItem('accessToken');
        if (!token) return;
        const resp = await fetch('/api/ai/chat/history', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) return;
        const { data } = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          setMessages(historyToMessages(data));
        }
      } catch { /* ignore */ } finally {
        setHistoryLoading(false);
      }
    };
    loadHistory();
  }, []);

  // Load sessions list
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const token = sessionStorage.getItem('accessToken');
        if (!token) return;
        const resp = await fetch('/api/ai/chat/sessions', { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) return;
        const { data } = await resp.json();
        if (Array.isArray(data)) setSessions(data);
      } catch { /* ignore */ } finally {
        setSessionsLoading(false);
      }
    };
    loadSessions();
  }, []);

  const loadSessionView = async (meta: SessionMeta) => {
    setViewLoading(true);
    setViewingSession({ meta, messages: [] });
    try {
      const token = sessionStorage.getItem('accessToken');
      const resp = await fetch(`/api/ai/chat/sessions/${meta.id}`, { headers: { Authorization: `Bearer ${token || ''}` } });
      const { data } = await resp.json();
      if (Array.isArray(data)) setViewingSession({ meta, messages: historyToMessages(data) });
    } catch { /* ignore */ } finally {
      setViewLoading(false);
    }
  };

  const deleteSessionById = async (id: string) => {
    const token = sessionStorage.getItem('accessToken');
    await fetch(`/api/ai/chat/sessions/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token || ''}` } }).catch(() => {});
    setSessions(prev => prev.filter(s => s.id !== id));
    if (viewingSession?.meta.id === id) setViewingSession(null);
  };


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

      if (resp.status === 401) {
        // Token rejected despite refresh attempt — force re-login
        window.location.href = '/login';
        return;
      }

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const part of parts) {
          const parsed = parseSSEBuffer(part + '\n\n');
          for (const { event: evt, data } of parsed) {
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
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: 'Connection error. Please try again.', isStreaming: false, error: true };
          return msgs;
        });
        setStreaming(false);
      }
    }
  }, [streaming]);

  const clearChat = async () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    setViewingSession(null);
    const token = sessionStorage.getItem('accessToken');
    await fetch('/api/ai/chat/history', {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
    // Refresh sessions list to show newly archived conversation
    try {
      const resp = await fetch('/api/ai/chat/sessions', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (resp.ok) { const { data } = await resp.json(); if (Array.isArray(data)) setSessions(data); }
    } catch { /* ignore */ }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            AI Assistant
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ask anything about your org's compensation data — Claude queries live DB</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-green-200 bg-green-50 dark:bg-green-900/20 text-xs font-medium text-green-700 dark:text-green-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Claude claude-sonnet-4-6
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              New conversation
            </button>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Messages */}
        <div className="flex-1 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {historyLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">Your AI Compensation Analyst</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    I have access to your live employee data, salary bands, performance ratings, and benefits.
                    Ask me anything — I'll pull real numbers.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                  {STARTERS.map(s => (
                    <button
                      key={s.label}
                      onClick={() => sendMessage(s.prompt)}
                      className="text-left px-3 py-2.5 rounded-lg border border-border bg-background hover:border-primary/40 hover:bg-primary/5 transition-all text-xs"
                    >
                      <p className="font-medium text-foreground">{s.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    'rounded-2xl px-4 py-3',
                    msg.role === 'user'
                      ? 'max-w-[75%] bg-primary text-primary-foreground rounded-tr-sm text-sm'
                      : msg.error
                      ? 'max-w-[85%] bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-tl-sm text-sm'
                      : 'max-w-[85%] bg-muted/40 text-foreground border border-border/40 rounded-tl-sm text-sm'
                  )}>
                    {/* Tool call indicators */}
                    {msg.activeTools && msg.activeTools.length > 0 && (
                      <div className="mb-3 space-y-1.5">
                        {msg.activeTools.map(tool => (
                          <div key={tool} className="flex items-center gap-2 text-xs text-muted-foreground bg-background/60 rounded-lg px-2.5 py-1.5">
                            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                            {TOOL_LABELS[tool] || tool}
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.content ? (
                      msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      ) : (
                        <div className="text-sm text-foreground min-w-0">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={MD_COMPONENTS}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )
                    ) : msg.isStreaming ? (
                      <span className="inline-flex gap-1 items-center h-5">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" />
                      </span>
                    ) : null}
                    {msg.isStreaming && msg.content && (
                      <span className="inline-block w-0.5 h-4 bg-primary/70 animate-pulse ml-0.5 align-text-bottom" />
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-secondary-foreground" />
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 p-4 border-t border-border">
            <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about your compensation data… (Enter to send, Shift+Enter for newline)"
                disabled={streaming}
                rows={2}
                className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground disabled:opacity-50 resize-none"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || streaming}
                className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-primary/90 transition-colors mb-0.5"
              >
                {streaming ? <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" /> : <Send className="w-4 h-4 text-primary-foreground" />}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar: History + capabilities */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-3 min-h-0">

          {/* Conversation History */}
          <div className="rounded-xl border border-border bg-card flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">History</p>
              </div>
              {sessions.length > 0 && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{sessions.length}</span>
              )}
            </div>

            {/* Session viewer overlay */}
            {viewingSession ? (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 flex-shrink-0">
                  <button
                    onClick={() => setViewingSession(null)}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-muted transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <p className="text-xs font-medium text-foreground truncate flex-1">{viewingSession.meta.title}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {viewLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : viewingSession.messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No messages found</p>
                  ) : (
                    viewingSession.messages.map((msg, i) => (
                      <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                        {msg.role === 'assistant' && (
                          <div className="w-5 h-5 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Bot className="w-3 h-3 text-primary" />
                          </div>
                        )}
                        <div className={cn(
                          'max-w-[85%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed',
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-muted/60 text-foreground border border-border/30 rounded-tl-sm'
                        )}>
                          {msg.role === 'user' ? (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          ) : (
                            <div className="min-w-0">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-5 h-5 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                            <User className="w-3 h-3 text-secondary-foreground" />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="p-3 border-t border-border flex-shrink-0">
                  <p className="text-[10px] text-muted-foreground text-center">
                    {new Date(viewingSession.meta.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}{viewingSession.meta.messageCount} {viewingSession.meta.messageCount === 1 ? 'message' : 'messages'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {sessionsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
                    <MessageSquare className="w-6 h-6 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Past conversations will appear here</p>
                    <p className="text-[10px] text-muted-foreground/60">Start a new conversation to get going</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {sessions.map(s => (
                      <div
                        key={s.id}
                        className="group flex items-start gap-2 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => loadSessionView(s)}
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate leading-tight">{s.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            {' · '}{s.messageCount}q
                          </p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); deleteSessionById(s.id); }}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all flex-shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live Data Access */}
          <div className="rounded-xl border border-border bg-card p-4 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2.5">
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Data Access</p>
            </div>
            <ul className="space-y-1.5">
              {['Salaries & bands', 'Pay equity & gender gap', 'Performance ratings', 'Band compliance', 'Benefits', 'Scenario modelling'].map(item => (
                <li key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-green-500">✓</span>{item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
