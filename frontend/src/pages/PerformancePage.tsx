import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, TrendingUp, X, ChevronUp, ChevronDown, Search, Filter, ArrowUpDown, Sparkles, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

const performanceApi = {
  getMatrix: async () => { const r = await api.get('/performance/matrix'); return r.data; },
  getPromotionReadiness: async () => { const r = await api.get('/performance/promotion-readiness'); return r.data; },
  getPayAlignmentGaps: async () => { const r = await api.get('/performance/pay-alignment-gaps'); return r.data; },
  getAIAnalysis: async () => { const r = await api.get('/performance/ai-analysis'); return r.data; },
};

const BAND_COLORS: Record<string, string> = {
  A1: 'bg-slate-100 text-slate-700',
  A2: 'bg-blue-100 text-blue-700',
  P1: 'bg-indigo-100 text-indigo-700',
  P2: 'bg-violet-100 text-violet-700',
  P3: 'bg-purple-100 text-purple-700',
  M1: 'bg-amber-100 text-amber-700',
  M2: 'bg-orange-100 text-orange-700',
  D0: 'bg-rose-100 text-rose-700',
  D1: 'bg-red-100 text-red-700',
  D2: 'bg-pink-100 text-pink-700',
  P4: 'bg-fuchsia-100 text-fuchsia-700',
};

const QUADRANT_COLORS: Record<string, string> = {
  STAR: 'bg-blue-500',
  SOLID: 'bg-green-500',
  UNDER: 'bg-red-500',
  AVERAGE: 'bg-yellow-500',
};

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn('w-3 h-3', i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30')}
        />
      ))}
    </div>
  );
}

export default function PerformancePage() {
  const [activeTab, setActiveTab] = useState<'matrix' | 'promotion' | 'gaps'>('matrix');
  const [showAI, setShowAI] = useState(false);
  const queryClient = useQueryClient();
  const [showFilters, setShowFilters] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterBand, setFilterBand] = useState('');
  const [filterQuadrant, setFilterQuadrant] = useState('');
  const [filterRatingMin, setFilterRatingMin] = useState('');
  const [filterRatingMax, setFilterRatingMax] = useState('');
  const [filterCompaMin, setFilterCompaMin] = useState('');
  const [filterCompaMax, setFilterCompaMax] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const navigate = useNavigate();

  const { data: matrixRaw, isLoading: matrixLoading } = useQuery({
    queryKey: ['performance', 'matrix'],
    queryFn: performanceApi.getMatrix,
  });
  const { data: promotionRaw, isLoading: promotionLoading } = useQuery({
    queryKey: ['performance', 'promotion-readiness'],
    queryFn: performanceApi.getPromotionReadiness,
  });
  const { data: gapsRaw, isLoading: gapsLoading } = useQuery({
    queryKey: ['performance', 'pay-alignment-gaps'],
    queryFn: performanceApi.getPayAlignmentGaps,
  });
  const { data: aiRaw, isLoading: aiLoading, refetch: refetchAI } = useQuery({
    queryKey: ['performance', 'ai-analysis'],
    queryFn: performanceApi.getAIAnalysis,
    enabled: showAI,
    staleTime: 1800000,
  });
  const aiNarrative = (aiRaw?.data?.narrative || '') as string;

  const matrix = (matrixRaw?.data || []) as any[];
  const promotionList = (promotionRaw?.data || []) as any[];
  const gaps = (gapsRaw?.data || { stars: [], under: [], summary: { starCount: 0, underCount: 0 } }) as any;

  // Unique filter options derived from all data
  const allDepartments = useMemo(() => {
    const depts = new Set<string>();
    matrix.forEach((e: any) => e.department && depts.add(e.department));
    promotionList.forEach((e: any) => e.department && depts.add(e.department));
    return Array.from(depts).sort();
  }, [matrix, promotionList]);

  const allBands = useMemo(() => {
    const bands = new Set<string>();
    matrix.forEach((e: any) => e.band && bands.add(e.band));
    promotionList.forEach((e: any) => e.band && bands.add(e.band));
    return Array.from(bands).sort();
  }, [matrix, promotionList]);

  const activeFilterCount = [searchName, filterDepartment, filterBand, filterQuadrant, filterRatingMin, filterRatingMax, filterCompaMin, filterCompaMax].filter(Boolean).length;

  function applyFilters(list: any[]) {
    let result = list;
    if (searchName) result = result.filter((e: any) => e.name?.toLowerCase().includes(searchName.toLowerCase()));
    if (filterDepartment) result = result.filter((e: any) => e.department === filterDepartment);
    if (filterBand) result = result.filter((e: any) => e.band === filterBand);
    if (filterQuadrant) result = result.filter((e: any) => e.quadrant === filterQuadrant);
    if (filterRatingMin) result = result.filter((e: any) => e.rating >= parseFloat(filterRatingMin));
    if (filterRatingMax) result = result.filter((e: any) => e.rating <= parseFloat(filterRatingMax));
    if (filterCompaMin) result = result.filter((e: any) => e.compaRatio >= parseFloat(filterCompaMin));
    if (filterCompaMax) result = result.filter((e: any) => e.compaRatio <= parseFloat(filterCompaMax));
    return result;
  }

  function applySort(list: any[]) {
    if (!sortBy) return list;
    return [...list].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  function handleSort(field: string) {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
  }

  function resetFilters() {
    setSearchName(''); setFilterDepartment(''); setFilterBand('');
    setFilterQuadrant(''); setFilterRatingMin(''); setFilterRatingMax('');
    setFilterCompaMin(''); setFilterCompaMax(''); setSortBy(''); setSortDir('asc');
  }

  const filteredMatrix = useMemo(() => applySort(applyFilters(matrix)), [matrix, searchName, filterDepartment, filterBand, filterQuadrant, filterRatingMin, filterRatingMax, filterCompaMin, filterCompaMax, sortBy, sortDir]);
  const filteredPromotion = useMemo(() => applySort(applyFilters(promotionList)), [promotionList, searchName, filterDepartment, filterBand, filterRatingMin, filterRatingMax, filterCompaMin, filterCompaMax, sortBy, sortDir]);
  const filteredStars = useMemo(() => applySort(applyFilters(gaps.stars)), [gaps.stars, searchName, filterDepartment, filterBand, filterRatingMin, filterRatingMax, filterCompaMin, filterCompaMax, sortBy, sortDir]);
  const filteredUnder = useMemo(() => applySort(applyFilters(gaps.under)), [gaps.under, searchName, filterDepartment, filterBand, filterRatingMin, filterRatingMax, filterCompaMin, filterCompaMax, sortBy, sortDir]);

  const quadrantCounts = matrix.reduce((acc: Record<string, number>, e: any) => {
    acc[e.quadrant] = (acc[e.quadrant] || 0) + 1;
    return acc;
  }, {});

  const tabs = [
    { key: 'matrix', label: 'Pay-Performance Matrix' },
    { key: 'promotion', label: 'Promotion Readiness' },
    { key: 'gaps', label: 'Pay Alignment Gaps' },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Performance Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analyze pay-performance alignment, promotion readiness, and compensation gaps
          </p>
        </div>
        <button
          onClick={() => { setShowAI(!showAI); if (!showAI) refetchAI(); }}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
            showAI ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'
          )}
        >
          <Sparkles className="w-4 h-4" />
          AI Analysis
        </button>
      </div>

      {showAI && (
        <div className="rounded-xl border border-primary/30 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-primary/5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Performance AI Analysis</span>
              <span className="text-xs text-muted-foreground">Powered by Claude</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { queryClient.removeQueries({ queryKey: ['performance', 'ai-analysis'] }); refetchAI(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerate
              </button>
              <button onClick={() => setShowAI(false)} className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-5 max-h-96 overflow-y-auto">
            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full border-2 border-primary/30 animate-spin border-t-primary" />
                  <Sparkles className="w-4 h-4 text-primary absolute inset-0 m-auto" />
                </div>
                <p className="text-sm text-muted-foreground">Claude is analyzing performance data...</p>
              </div>
            ) : aiNarrative ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-base font-bold text-foreground mt-3 mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-sm font-semibold text-foreground mt-3 mb-1.5">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-2 mb-1">{children}</h3>,
                    p: ({ children }) => <p className="text-sm text-foreground leading-relaxed mb-2">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2">{children}</ul>,
                    li: ({ children }) => <li className="text-sm text-foreground">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                  }}
                >
                  {aiNarrative}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-8">
                <Sparkles className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Click Regenerate to generate a fresh AI analysis</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Stars (High Perf, Low Pay)', value: gaps.summary?.starCount || 0, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: '⭐' },
          { label: 'Under (Low Perf, High Pay)', value: gaps.summary?.underCount || 0, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', icon: '⚠️' },
          { label: 'Promotion Ready', value: promotionList.length, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', icon: '🚀' },
          { label: 'In Matrix', value: matrix.length, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', icon: '📊' },
        ].map(kpi => (
          <div key={kpi.label} className={cn('rounded-xl border border-border p-4', kpi.bg)}>
            <div className="flex items-center gap-2 mb-2">
              <span>{kpi.icon}</span>
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className={cn('text-2xl font-bold', kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Filter Bar (same row) */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  activeTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name…"
                value={searchName}
                onChange={e => setSearchName(e.target.value)}
                className="w-48 pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors',
                showFilters || activeFilterCount > 0
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-primary text-primary-foreground font-medium">{activeFilterCount}</span>
              )}
            </button>
            {(activeFilterCount > 0 || sortBy) && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-lg border border-border bg-background transition-colors"
              >
                <X className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 p-3 rounded-xl border border-border bg-muted/30">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Department</label>
              <select
                value={filterDepartment}
                onChange={e => setFilterDepartment(e.target.value)}
                className="text-sm rounded-lg border border-border bg-background text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All</option>
                {allDepartments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Band</label>
              <select
                value={filterBand}
                onChange={e => setFilterBand(e.target.value)}
                className="text-sm rounded-lg border border-border bg-background text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All</option>
                {allBands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {activeTab === 'matrix' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Quadrant</label>
                <select
                  value={filterQuadrant}
                  onChange={e => setFilterQuadrant(e.target.value)}
                  className="text-sm rounded-lg border border-border bg-background text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">All</option>
                  <option value="STAR">Star</option>
                  <option value="SOLID">Solid</option>
                  <option value="UNDER">Under</option>
                  <option value="AVERAGE">Average</option>
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Rating (min–max)</label>
              <div className="flex items-center gap-1">
                <input type="number" min="1" max="5" step="0.5" placeholder="1" value={filterRatingMin} onChange={e => setFilterRatingMin(e.target.value)} className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <span className="text-muted-foreground text-xs">–</span>
                <input type="number" min="1" max="5" step="0.5" placeholder="5" value={filterRatingMax} onChange={e => setFilterRatingMax(e.target.value)} className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Compa-Ratio % (min–max)</label>
              <div className="flex items-center gap-1">
                <input type="number" placeholder="0" value={filterCompaMin} onChange={e => setFilterCompaMin(e.target.value)} className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <span className="text-muted-foreground text-xs">–</span>
                <input type="number" placeholder="200" value={filterCompaMax} onChange={e => setFilterCompaMax(e.target.value)} className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Sort by</label>
              <div className="flex gap-1">
                <select
                  value={sortBy}
                  onChange={e => { setSortBy(e.target.value); setSortDir('asc'); }}
                  className="flex-1 text-sm rounded-lg border border-border bg-background text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Default</option>
                  <option value="name">Name</option>
                  <option value="band">Band</option>
                  <option value="department">Department</option>
                  <option value="rating">Rating</option>
                  <option value="compaRatio">Compa-Ratio</option>
                  {activeTab === 'matrix' && <option value="annualCtc">Annual CTC</option>}
                  {activeTab === 'promotion' && <option value="tenureMonths">Tenure</option>}
                  {(activeTab === 'promotion' || activeTab === 'gaps') && <option value="annualFixed">Annual Fixed</option>}
                </select>
                <button
                  onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  disabled={!sortBy}
                  className="p-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                >
                  {sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pay-Performance Matrix */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          {matrixLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Quadrant legend */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { key: 'STAR', label: 'Stars', desc: 'High perf + Low pay — Retention risk', color: 'border-blue-300 bg-blue-50 dark:bg-blue-900/20' },
                  { key: 'SOLID', label: 'Solid Performers', desc: 'High perf + Fair pay — Keep', color: 'border-green-300 bg-green-50 dark:bg-green-900/20' },
                  { key: 'UNDER', label: 'Under Performers', desc: 'Low perf + High pay — Action needed', color: 'border-red-300 bg-red-50 dark:bg-red-900/20' },
                  { key: 'AVERAGE', label: 'Average', desc: 'Middle performers', color: 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20' },
                ].map(q => (
                  <div key={q.key} className={cn('rounded-lg border p-3', q.color)}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn('w-2.5 h-2.5 rounded-full', QUADRANT_COLORS[q.key])} />
                      <span className="text-xs font-semibold text-foreground">{q.label}</span>
                      <span className="ml-auto text-sm font-bold text-foreground">{quadrantCounts[q.key] || 0}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{q.desc}</p>
                  </div>
                ))}
              </div>

              {/* Matrix table */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {[
                        { label: 'Employee', field: 'name' },
                        { label: 'Band', field: 'band' },
                        { label: 'Department', field: 'department' },
                        { label: 'Rating', field: 'rating' },
                        { label: 'Compa-Ratio', field: 'compaRatio' },
                        { label: 'Annual CTC', field: 'annualCtc' },
                        { label: 'Quadrant', field: 'quadrant' },
                        { label: '', field: '' },
                      ].map(({ label, field }) => (
                        <th
                          key={label}
                          onClick={() => field && handleSort(field)}
                          className={cn('text-left px-4 py-3 text-xs font-medium text-muted-foreground', field && 'cursor-pointer hover:text-foreground select-none')}
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            {field && (sortBy === field
                              ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
                              : field && <ArrowUpDown className="w-3 h-3 opacity-30" />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredMatrix.map((e: any) => (
                      <tr
                        key={e.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-foreground cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>{e.name}</td>
                        <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', BAND_COLORS[e.band] || 'bg-muted text-muted-foreground')}>
                            {e.band}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>{e.department}</td>
                        <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}><RatingStars rating={Math.round(e.rating)} /></td>
                        <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>
                          <span className={cn(
                            'font-medium',
                            e.compaRatio >= 90 && e.compaRatio <= 110 ? 'text-green-600' : e.compaRatio < 80 ? 'text-red-600' : 'text-orange-600'
                          )}>
                            {e.compaRatio.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>₹{(e.annualCtc / 100000).toFixed(1)}L</td>
                        <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            e.quadrant === 'STAR' ? 'bg-blue-100 text-blue-700' :
                            e.quadrant === 'SOLID' ? 'bg-green-100 text-green-700' :
                            e.quadrant === 'UNDER' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          )}>
                            {e.quadrant}
                          </span>
                        </td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredMatrix.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">{matrix.length === 0 ? 'No performance data available' : 'No employees match the current filters'}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Promotion Readiness */}
      {activeTab === 'promotion' && (
        <div>
          {promotionLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {[
                      { label: 'Employee', field: 'name' },
                      { label: 'Current Band', field: 'band' },
                      { label: 'Next Band', field: 'nextBand' },
                      { label: 'Rating', field: 'rating' },
                      { label: 'Compa-Ratio', field: 'compaRatio' },
                      { label: 'Tenure', field: 'tenureMonths' },
                      { label: 'Annual Fixed', field: 'annualFixed' },
                      { label: '', field: '' },
                    ].map(({ label, field }) => (
                      <th
                        key={label}
                        onClick={() => field && handleSort(field)}
                        className={cn('text-left px-4 py-3 text-xs font-medium text-muted-foreground', field && 'cursor-pointer hover:text-foreground select-none')}
                      >
                        <span className="inline-flex items-center gap-1">
                          {label}
                          {field && (sortBy === field
                            ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
                            : <ArrowUpDown className="w-3 h-3 opacity-30" />
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPromotion.map((e: any) => (
                    <tr
                      key={e.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>
                        <p className="font-medium text-foreground">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.department}</p>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', BAND_COLORS[e.band] || 'bg-muted text-muted-foreground')}>
                          {e.band}
                        </span>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-green-500" />
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', BAND_COLORS[e.nextBand] || 'bg-muted text-muted-foreground')}>
                            {e.nextBand}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}><RatingStars rating={Math.round(e.rating)} /></td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>
                        <span className={cn('font-medium', e.compaRatio >= 90 ? 'text-green-600' : 'text-yellow-600')}>
                          {e.compaRatio.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>{e.tenureMonths}mo</td>
                      <td className="px-4 py-3 font-medium text-foreground cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>₹{(e.annualFixed / 100000).toFixed(1)}L</td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPromotion.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">{promotionList.length === 0 ? 'No employees currently ready for promotion' : 'No employees match the current filters'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}


      {/* Pay Alignment Gaps */}
      {activeTab === 'gaps' && (
        <div className="space-y-6">
          {gapsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Stars section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <h3 className="text-sm font-semibold text-foreground">Stars — High Performers, Below Market</h3>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">{filteredStars.length}{filteredStars.length !== gaps.stars.length ? ` / ${gaps.stars.length}` : ''}</span>
                </div>
                {filteredStars.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2">{gaps.stars.length === 0 ? 'No employees in this category' : 'No employees match the current filters'}</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {filteredStars.map((e: any) => (
                      <div
                        key={e.id}
                        className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 p-4 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="cursor-pointer flex-1" onClick={() => navigate(`/employees/${e.id}`)}>
                            <p className="text-sm font-semibold text-foreground">{e.name}</p>
                            <p className="text-xs text-muted-foreground">{e.department} · {e.band}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                              Retention Risk
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                          <span>Rating: <strong className="text-foreground">{e.rating}</strong></span>
                          <span>Compa-Ratio: <strong className="text-red-600">{e.compaRatio.toFixed(0)}%</strong></span>
                          <span>CTC: <strong className="text-foreground">₹{(e.annualFixed / 100000).toFixed(1)}L</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Under section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <h3 className="text-sm font-semibold text-foreground">Under — Low Performers, Above Market</h3>
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">{filteredUnder.length}{filteredUnder.length !== gaps.under.length ? ` / ${gaps.under.length}` : ''}</span>
                </div>
                {filteredUnder.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2">{gaps.under.length === 0 ? 'No employees in this category' : 'No employees match the current filters'}</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {filteredUnder.map((e: any) => (
                      <div
                        key={e.id}
                        className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="cursor-pointer flex-1" onClick={() => navigate(`/employees/${e.id}`)}>
                            <p className="text-sm font-semibold text-foreground">{e.name}</p>
                            <p className="text-xs text-muted-foreground">{e.department} · {e.band}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                              Action Needed
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                          <span>Rating: <strong className="text-foreground">{e.rating}</strong></span>
                          <span>Compa-Ratio: <strong className="text-orange-600">{e.compaRatio.toFixed(0)}%</strong></span>
                          <span>CTC: <strong className="text-foreground">₹{(e.annualFixed / 100000).toFixed(1)}L</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
