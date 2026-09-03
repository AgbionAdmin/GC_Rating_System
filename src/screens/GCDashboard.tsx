import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Plus, Search, Upload, X, Settings, FileDown } from 'lucide-react';
import { supabase, type GeneralContractor, type Rating } from '../lib/supabase';
import { type BidThresholds, DEFAULT_THRESHOLDS, totalBidsToScore, fetchThresholds } from '../lib/bidThresholds';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import AddGCModal from '../components/AddGCModal';
import ThresholdsModal from '../components/ThresholdsModal';

type Props = {
  onBack: () => void;
  backLabel?: string;
  onSelectGC: (gcId: string) => void;
  onUploadCSV: () => void;
};

export type GCRow = {
  id: string;
  name: string;
  hit_rate_dollar_score: number | null;
  payment_timeline: number;
  co_approval_timeline: number;
  co_negotiations: number;
  contract_terms: number;
  conflict_mitigation: number;
  schedule_trade_stacking: number;
  schedule_accuracy: number;
  site_control: number;
  relationship: number;
  safety: number | null;
  est_relationship: number | null;
  total_bids: number | null;
  overall_score: number | null;
  rating_count: number;
};

type SortKey = keyof GCRow;
type SortDir = 'asc' | 'desc';

const SCORE_COLUMNS: SortKey[] = [
  'payment_timeline', 'co_approval_timeline', 'co_negotiations',
  'contract_terms', 'conflict_mitigation', 'schedule_trade_stacking',
  'schedule_accuracy', 'site_control', 'relationship', 'safety',
];

const COLUMNS: { key: SortKey; label: string; short: string }[] = [
  { key: 'name', label: 'GC Name', short: 'GC Name' },
  { key: 'overall_score', label: 'Overall Score', short: 'Overall' },
  { key: 'payment_timeline', label: 'Payment Timeline', short: 'Payment' },
  { key: 'co_approval_timeline', label: 'CO Approval', short: 'CO Appr.' },
  { key: 'co_negotiations', label: 'CO Negotiations', short: 'CO Neg.' },
  { key: 'contract_terms', label: 'Contract Terms', short: 'Contract' },
  { key: 'conflict_mitigation', label: 'Conflict Mitigation', short: 'Conflict' },
  { key: 'schedule_trade_stacking', label: 'Schedule (Stacking)', short: 'Stacking' },
  { key: 'schedule_accuracy', label: 'Schedule (Accuracy)', short: 'Accuracy' },
  { key: 'site_control', label: 'Site Control', short: 'Site' },
  { key: 'relationship', label: 'PM Relation', short: 'PM Relation' },
  { key: 'safety', label: 'Safety', short: 'Safety' },
  { key: 'est_relationship', label: 'Est Relation', short: 'Est Relation' },
  { key: 'total_bids', label: 'Total Bids', short: 'Total Bids' },
  { key: 'hit_rate_dollar_score', label: 'Hit Rate ($)', short: 'Hit Rate ($)' },
  { key: 'rating_count', label: '# of Ratings', short: '# Ratings' },
];

function avg(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function avgNotNull(vals: (number | null)[]): number | null {
  const nonNull = vals.filter((v): v is number => v != null);
  if (!nonNull.length) return null;
  return nonNull.reduce((a, b) => a + b, 0) / nonNull.length;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

// Convert a 0–1 hit rate ratio to a 1–5 score (min 1 when ratio < 0.2)
function hitRateToScore(ratio: number): number {
  const raw = ratio * 5;
  return Math.min(5, Math.max(1, raw));
}

function gcMatchScore(name: string, query: string): number {
  if (!query) return 1;
  const n = name.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 1;

  if (n === q) return 1000;

  const subIdx = n.indexOf(q);
  if (subIdx !== -1) return 500 + (100 - subIdx);

  const queryWords = q.split(/\s+/).filter(Boolean);
  const nameWords = n.split(/[\s,.\-/]+/).filter(Boolean);
  const allWordsMatch = queryWords.every((qw) =>
    nameWords.some((nw) => nw.includes(qw) || qw.includes(nw))
  );
  if (allWordsMatch && queryWords.length > 0) return 300;

  let ni = 0;
  let matched = 0;
  for (let qi = 0; qi < q.length; qi++) {
    while (ni < n.length && n[ni] !== q[qi]) ni++;
    if (ni < n.length) { matched++; ni++; }
  }
  const ratio = matched / q.length;
  if (ratio >= 0.7) return Math.round(ratio * 200);

  return 0;
}

function ScoreCell({ value, highlight }: { value: number; highlight?: boolean }) {
  const color =
    value >= 3.5 ? 'text-green-400' :
    value >= 2 ? 'text-yellow-400' : 'text-red-400';
  return (
    <span className={`${color} font-medium tabular-nums ${highlight ? 'font-bold' : ''}`}>
      {fmt(value)}
    </span>
  );
}

export function buildGCRow(gc: GeneralContractor, gcRatings: Rating[], thresholds: BidThresholds = DEFAULT_THRESHOLDS): GCRow {
  const hit_rate_dollar_score =
    gc.hit_rate_dollar != null ? hitRateToScore(gc.hit_rate_dollar) : null;
  const total_bids =
    gc.total_bids_submitted_raw != null ? totalBidsToScore(gc.total_bids_submitted_raw, thresholds) : null;

  if (gcRatings.length === 0) {
    return {
      id: gc.id,
      name: gc.name,
      hit_rate_dollar_score,
      payment_timeline: 0,
      co_approval_timeline: 0,
      co_negotiations: 0,
      contract_terms: 0,
      conflict_mitigation: 0,
      schedule_trade_stacking: 0,
      schedule_accuracy: 0,
      site_control: 0,
      relationship: 0,
      safety: 0,
      est_relationship: gc.est_relationship ?? null,
      total_bids,
      overall_score: null,
      rating_count: 0,
    };
  }

  const categoryAvgs = {
    payment_timeline: avg(gcRatings.map((r) => r.payment_timeline)),
    co_approval_timeline: avg(gcRatings.map((r) => r.co_approval_timeline)),
    co_negotiations: avg(gcRatings.map((r) => r.co_negotiations)),
    contract_terms: avg(gcRatings.map((r) => r.contract_terms)),
    conflict_mitigation: avg(gcRatings.map((r) => r.conflict_mitigation)),
    schedule_trade_stacking: avg(gcRatings.map((r) => r.schedule_trade_stacking)),
    schedule_accuracy: avg(gcRatings.map((r) => r.schedule_accuracy)),
    site_control: avg(gcRatings.map((r) => r.site_control)),
    relationship: avg(gcRatings.map((r) => r.relationship)),
    safety: avgNotNull(gcRatings.map((r) => r.safety)),
  };

  const catValues = [
    categoryAvgs.payment_timeline,
    categoryAvgs.co_approval_timeline,
    categoryAvgs.co_negotiations,
    categoryAvgs.contract_terms,
    categoryAvgs.conflict_mitigation,
    categoryAvgs.schedule_trade_stacking,
    categoryAvgs.schedule_accuracy,
    categoryAvgs.site_control,
    categoryAvgs.relationship,
    ...(categoryAvgs.safety != null ? [categoryAvgs.safety] : []),
  ];
  const extraScores = [hit_rate_dollar_score, total_bids].filter((v): v is number => v != null);
  const overall_score = avg([...catValues, ...extraScores]);

  return {
    id: gc.id,
    name: gc.name,
    hit_rate_dollar_score,
    ...categoryAvgs,
    est_relationship: gc.est_relationship ?? null,
    total_bids,
    overall_score,
    rating_count: gcRatings.length,
  };
}

export default function GCDashboard({ onBack, backLabel = '← Back', onSelectGC, onUploadCSV }: Props) {
  const [rows, setRows] = useState<GCRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('overall_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showThresholdsModal, setShowThresholdsModal] = useState(false);
  const [thresholds, setThresholds] = useState<BidThresholds>(DEFAULT_THRESHOLDS);
  const [pendingGCName, setPendingGCName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const scrollbarInnerRef = useRef<HTMLDivElement>(null);
  const syncingFromTable = useRef(false);
  const syncingFromScrollbar = useRef(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSearchFocused(false);
        inputRef.current?.blur();
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, []);

  useEffect(() => { fetchData(); }, []);

  // Sync table horizontal scroll <-> custom scrollbar
  useEffect(() => {
    const table = tableWrapRef.current;
    const scrollbar = scrollbarRef.current;
    const inner = scrollbarInnerRef.current;
    if (!table || !scrollbar || !inner) return;

    function updateInnerWidth() {
      if (table && inner) inner.style.width = `${table.scrollWidth}px`;
    }
    updateInnerWidth();

    const ro = new ResizeObserver(updateInnerWidth);
    ro.observe(table);

    function onTableScroll() {
      if (syncingFromScrollbar.current) return;
      syncingFromTable.current = true;
      if (scrollbar) scrollbar.scrollLeft = table!.scrollLeft;
      syncingFromTable.current = false;
    }

    function onScrollbarScroll() {
      if (syncingFromTable.current) return;
      syncingFromScrollbar.current = true;
      if (table) table.scrollLeft = scrollbar!.scrollLeft;
      syncingFromScrollbar.current = false;
    }

    table.addEventListener('scroll', onTableScroll, { passive: true });
    scrollbar.addEventListener('scroll', onScrollbarScroll, { passive: true });
    return () => {
      table.removeEventListener('scroll', onTableScroll);
      scrollbar.removeEventListener('scroll', onScrollbarScroll);
      ro.disconnect();
    };
  }, [rows]);

  async function fetchData() {
    setLoading(true);
    setError('');
    const [gcRes, ratingsRes, loadedThresholds] = await Promise.all([
      supabase.from('general_contractors').select('*'),
      supabase.from('ratings').select('*').order('created_at', { ascending: false }),
      fetchThresholds(),
    ]);
    if (gcRes.error || ratingsRes.error) {
      setError('Failed to load dashboard data.');
      setLoading(false);
      return;
    }
    setThresholds(loadedThresholds);
    const gcs = (gcRes.data ?? []) as GeneralContractor[];
    const ratings = (ratingsRes.data ?? []) as Rating[];

    if (ratings.length > 0) setLastUpdated(ratings[0].created_at);

    const ratingsByGC = new Map<string, Rating[]>();
    for (const r of ratings) {
      if (!ratingsByGC.has(r.gc_id)) ratingsByGC.set(r.gc_id, []);
      ratingsByGC.get(r.gc_id)!.push(r);
    }

    const built: GCRow[] = [];
    for (const gc of gcs) {
      const gcRatings = ratingsByGC.get(gc.id) ?? [];
      built.push(buildGCRow(gc, gcRatings, loadedThresholds));
    }

    setRows(built);
    setLoading(false);
  }

  function handleGCAdded(gc: GeneralContractor) {
    setShowAddModal(false);
    setPendingGCName('');
    setRows((prev) => {
      if (prev.some((r) => r.id === gc.id)) return prev;
      return [...prev, buildGCRow(gc, [], thresholds)];
    });
    setSearchQuery(gc.name);
    setSelectedId(gc.id);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return rows
      .map((r) => ({ id: r.id, name: r.name, score: gcMatchScore(r.name, searchQuery) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [rows, searchQuery]);

  const sorted = useMemo(() => {
    let base = selectedId ? rows.filter((r) => r.id === selectedId) : [...rows];
    return base.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir, selectedId]);

  const top5Ids = useMemo(() => {
    return [...rows]
      .filter((r) => r.overall_score != null)
      .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
      .slice(0, 5)
      .map((r) => r.id);
  }, [rows]);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-white/20" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-brand-500" />
      : <ChevronDown className="w-3 h-3 text-brand-500" />;
  }

  return (
    <div className="min-h-[calc(100vh-80px)] px-4 py-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <button onClick={onBack} className="text-white/40 hover:text-white text-sm flex items-center gap-1 transition-colors mb-3">
              {backLabel}
            </button>
            <h2 className="text-2xl font-bold text-white">GC Performance Dashboard</h2>
            <p className="text-white/40 text-sm mt-1">
              {rows.length} contractor{rows.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {lastUpdated && (
              <div className="text-right">
                <p className="text-white/30 text-xs uppercase tracking-wider font-medium">Last Updated</p>
                <p className="text-white/50 text-sm mt-0.5">
                  {new Date(lastUpdated).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              </div>
            )}
            <button
              onClick={() => setShowThresholdsModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-sm font-medium rounded-lg transition-colors"
              title="Configure Total Bids scoring thresholds"
            >
              <Settings className="w-4 h-4" />
              Thresholds
            </button>
            <button
              onClick={() => {
                import('../lib/generatePeriodicReport').then(({ generatePeriodicReport }) => {
                  generatePeriodicReport(rows);
                });
              }}
              disabled={rows.filter((r) => r.rating_count > 0).length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium rounded-lg transition-colors"
              title="Download Periodic Report PDF"
            >
              <FileDown className="w-4 h-4" />
              Periodic Report
            </button>
            <button
              onClick={onUploadCSV}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload CSV
            </button>
          </div>
        </div>

        {error && <ErrorMessage message={error} />}
        {loading && <LoadingSpinner message="Loading GC data..." />}

        {!loading && !error && (
          <div ref={searchRef} className="relative mb-5">
            <div className={`flex items-center gap-3 bg-white/5 border rounded-xl px-4 py-3 transition-colors ${searchFocused ? 'border-brand-500/60' : 'border-white/10'}`}>
              <Search className="w-4 h-4 text-white/30 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedId(null); }}
                onFocus={() => setSearchFocused(true)}
                placeholder="Search or add a general contractor..."
                className="flex-1 bg-transparent text-white placeholder-white/20 text-sm focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSelectedId(null); inputRef.current?.focus(); }}
                  className="text-white/30 hover:text-white transition-colors flex-shrink-0"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {searchFocused && searchQuery.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a2d45] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-20">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSearchQuery(s.name);
                      setSelectedId(s.id);
                      setSearchFocused(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 flex items-center gap-3"
                  >
                    <Search className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                    <span className="text-white text-sm">{s.name}</span>
                  </button>
                ))}
                {suggestions.length === 0 && (
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-white/30 text-sm">No contractors match "{searchQuery}"</p>
                  </div>
                )}
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setPendingGCName(searchQuery.trim());
                    setShowAddModal(true);
                    setSearchFocused(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-brand-500/10 transition-colors flex items-center gap-3"
                >
                  <Plus className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                  <span className="text-brand-400 text-sm">Add new GC: "{searchQuery.trim()}"</span>
                </button>
              </div>
            )}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-20 text-white/30">
            <p className="text-lg">No contractors yet.</p>
            <p className="text-sm mt-2">Search above to add your first GC.</p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-brand-500 rounded-full" />
                <p className="text-white/40 text-xs">Top 5 contractors highlighted · Click a row to view details</p>
              </div>
              {selectedId && (
                <button
                  onClick={() => { setSearchQuery(''); setSelectedId(null); }}
                  className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Show all
                </button>
              )}
            </div>

            {/* Outer border wrapper */}
            <div className="rounded-xl border border-white/10 overflow-hidden">
              {/* Custom horizontal scrollbar — sits between header and body */}
              <div
                ref={scrollbarRef}
                className="overflow-x-scroll custom-scrollbar bg-white/[0.02] border-b border-white/10"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(200,64,26,0.5) rgba(255,255,255,0.04)' }}
              >
                <div ref={scrollbarInnerRef} style={{ height: 1 }} />
              </div>

              {/* Table scroll container — scrolls both axes; sticky thead works because this is the scroll ancestor */}
              <div
                ref={tableWrapRef}
                className="overflow-x-scroll overflow-y-auto hide-scrollbar-x"
                style={{ maxHeight: 'calc(100vh - 260px)' }}
              >
                <table className="w-full text-sm min-w-[1100px]">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-[#1e2f45] border-b border-white/10">
                      {COLUMNS.map((col) => {
                        const isPrimary = col.key === 'name' || col.key === 'overall_score';
                        const isName = col.key === 'name';
                        const isOverall = col.key === 'overall_score';
                        return (
                          <th
                            key={col.key}
                            onClick={() => handleSort(col.key)}
                            style={isName ? { left: 0 } : isOverall ? { left: '10rem' } : undefined}
                            className={`px-4 py-3 font-medium text-xs uppercase tracking-wider cursor-pointer hover:text-white/70 transition-colors select-none whitespace-nowrap
                              ${isPrimary ? 'sticky z-10 text-white/70 bg-[#1e2f45] border-r border-white/10 shadow-[2px_0_8px_rgba(0,0,0,0.3)]' : 'text-white/40'}
                              ${isName ? 'text-left w-40 min-w-[10rem]' : 'text-center'}`}
                          >
                            <div className={`flex items-center gap-1.5 ${isName ? '' : 'justify-center'}`}>
                              <span>{col.short}</span>
                              <SortIcon col={col.key} />
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {sorted.map((row) => {
                      const isTop5 = top5Ids.includes(row.id);
                      const rowBg = isTop5 ? '#1f2e42' : '#192333';
                      return (
                        <tr
                          key={row.id}
                          onClick={() => onSelectGC(row.id)}
                          className={`cursor-pointer transition-colors align-middle ${
                            isTop5
                              ? 'border-l-2 border-brand-500 bg-brand-500/5 hover:bg-brand-500/15'
                              : 'border-l-2 border-transparent hover:bg-white/5'
                          }`}
                        >
                          <td
                            className="sticky z-10 px-4 py-3 w-40 min-w-[10rem] border-r border-white/[0.06] shadow-[2px_0_8px_rgba(0,0,0,0.25)]"
                            style={{ left: 0, backgroundColor: rowBg }}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={`font-semibold text-sm leading-snug ${isTop5 ? 'text-white' : 'text-white/90'}`}
                                title={row.name}
                              >
                                {row.name}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider self-start ${isTop5 ? 'bg-brand-500/20 text-brand-400' : 'invisible'}`}>
                                Top 5
                              </span>
                            </div>
                          </td>
                          <td
                            className="sticky z-10 px-4 py-3 text-center border-r border-white/[0.06] shadow-[2px_0_8px_rgba(0,0,0,0.25)]"
                            style={{ left: '10rem', backgroundColor: rowBg }}
                          >
                            {row.rating_count > 0
                              ? <ScoreCell value={row.overall_score!} highlight={isTop5} />
                              : <span className="text-white/20">—</span>}
                          </td>
                          {SCORE_COLUMNS.map((col) => {
                            const val = row[col] as number | null;
                            return (
                              <td key={col} className="px-4 py-3 text-center">
                                {val != null
                                  ? <ScoreCell value={val} />
                                  : <span className="text-white/20">—</span>}
                              </td>
                            );
                          })}
                          {/* Est Relation */}
                          <td className="px-4 py-3 text-center">
                            {row.est_relationship != null
                              ? <ScoreCell value={row.est_relationship} />
                              : <span className="text-white/20">—</span>}
                          </td>
                          {/* Total Bids */}
                          <td className="px-4 py-3 text-center">
                            {row.total_bids != null
                              ? <ScoreCell value={row.total_bids} />
                              : <span className="text-white/20">—</span>}
                          </td>
                          {/* Hit Rate ($) */}
                          <td className="px-4 py-3 text-center">
                            {row.hit_rate_dollar_score != null
                              ? <ScoreCell value={row.hit_rate_dollar_score} />
                              : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-white/50 tabular-nums">{row.rating_count}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {showAddModal && (
        <AddGCModal
          initialName={pendingGCName}
          onClose={() => { setShowAddModal(false); setPendingGCName(''); }}
          onSaved={handleGCAdded}
        />
      )}

      {showThresholdsModal && (
        <ThresholdsModal
          onClose={() => setShowThresholdsModal(false)}
          onSaved={(newThresholds) => {
            setThresholds(newThresholds);
            setRows((prev) => prev.map((row) => {
              // We don't have raw dollar data in GCRow, so we need to re-fetch
              return row;
            }));
            fetchData();
          }}
        />
      )}
    </div>
  );
}
