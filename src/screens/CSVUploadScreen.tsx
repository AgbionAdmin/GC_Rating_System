import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase, type GeneralContractor } from '../lib/supabase';
import { type BidThresholds, DEFAULT_THRESHOLDS, totalBidsToScore, fetchThresholds } from '../lib/bidThresholds';

type Props = {
  onBack: () => void;
  onComplete: () => void;
};

type UploadType = 'buildingconnected' | 'est-relation';
type UploadState = 'idle' | 'parsing' | 'preview' | 'uploading' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchGC(
  client: string,
  gcs: GeneralContractor[],
): { gc: GeneralContractor | null; confidence: 'exact' | 'fuzzy' | 'none' } {
  const norm = normalize(client);

  for (const gc of gcs) {
    if (normalize(gc.name) === norm) return { gc, confidence: 'exact' };
    if (gc.aliases) {
      for (const alias of gc.aliases.split(/[,;]+/)) {
        if (normalize(alias.trim()) === norm) return { gc, confidence: 'exact' };
      }
    }
  }

  let best: GeneralContractor | null = null;
  let bestScore = 0;
  for (const gc of gcs) {
    const candidates = [
      gc.name,
      ...(gc.aliases ? gc.aliases.split(/[,;]+/).map((a) => a.trim()) : []),
    ];
    for (const cand of candidates) {
      const cn = normalize(cand);
      if (cn.includes(norm) || norm.includes(cn)) {
        const score =
          Math.min(cn.length, norm.length) / Math.max(cn.length, norm.length);
        if (score > bestScore) {
          bestScore = score;
          best = gc;
        }
      }
    }
  }
  if (best && bestScore >= 0.6) return { gc: best, confidence: 'fuzzy' };

  return { gc: null, confidence: 'none' };
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let inQuote = false;
    let cur = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === ',' && !inQuote) {
        cols.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

function parseDollar(s: string): number {
  return parseFloat(s.replace(/[$,\s]/g, '')) || 0;
}

function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function hitRateToRatio(bids: number, won: number): number {
  return bids === 0 ? 0 : won / bids;
}

const SCORE_COLOR = (v: number) =>
  v >= 3.5 ? 'text-green-400' : v >= 2 ? 'text-yellow-400' : 'text-red-400';

// ---------------------------------------------------------------------------
// BuildingConnected types & parsing
// ---------------------------------------------------------------------------

type BCParsedRow = {
  client: string;
  bids: number;
  bidsWon: number;
  totalBidsSubmitted: number;
  totalWin: number;
  hitRatePct: number;
  hitRateDollar: number;
  totalBidsScore: number;
};

type BCMatchedRow = BCParsedRow & {
  gcId: string | null;
  gcName: string | null;
  matchConfidence: 'exact' | 'fuzzy' | 'none';
};

function parseBCCSV(text: string, gcs: GeneralContractor[], thresholds: BidThresholds): BCMatchedRow[] {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('CSV appears to be empty or has no data rows.');

  const headerRow = rows[0].map((h) => h.trim().toLowerCase());

  const findCol = (names: string[]) => {
    for (const n of names) {
      const idx = headerRow.findIndex((h) => h === n.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colClient = findCol(['client']);
  const colBids = findCol(['# bids', '#bids', 'bids', 'number of bids']);
  const colBidsWon = findCol(['# bids won', '#bids won', 'bids won', 'number of bids won']);
  const colTotalSubmitted = findCol(['total bids submitted', 'total bids', 'bids submitted']);
  const colTotalWin = findCol(['total won', 'total win', 'total wins', 'win total']);

  const missing: string[] = [];
  if (colClient === -1) missing.push('Client');
  if (colBids === -1) missing.push('# Bids');
  if (colBidsWon === -1) missing.push('# Bids Won');
  if (colTotalSubmitted === -1) missing.push('Total Bids Submitted');
  if (colTotalWin === -1) missing.push('Total Won');
  if (missing.length > 0) {
    throw new Error(
      `Missing required columns: ${missing.join(', ')}. Make sure you're uploading the "Client" sheet.`,
    );
  }

  const result: BCMatchedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const client = row[colClient]?.trim();
    if (!client) continue;
    const bids = parseFloat(row[colBids]) || 0;
    if (bids === 0) continue;

    const bidsWon = parseFloat(row[colBidsWon]) || 0;
    const totalBidsSubmitted = parseDollar(row[colTotalSubmitted] ?? '0');
    const totalWin = parseDollar(row[colTotalWin] ?? '0');
    const hitRatePct = hitRateToRatio(bids, bidsWon);
    const hitRateDollar = totalBidsSubmitted > 0 ? totalWin / totalBidsSubmitted : 0;
    const totalBidsScore = totalBidsToScore(totalBidsSubmitted, thresholds);

    const { gc, confidence } = matchGC(client, gcs);
    result.push({
      client,
      bids,
      bidsWon,
      totalBidsSubmitted,
      totalWin,
      hitRatePct,
      hitRateDollar,
      totalBidsScore,
      gcId: gc?.id ?? null,
      gcName: gc?.name ?? null,
      matchConfidence: confidence,
    });
  }

  if (result.length === 0) {
    throw new Error('No valid rows found (all rows had 0 bids or were empty).');
  }
  return result;
}

// ---------------------------------------------------------------------------
// Est Relation types & parsing
// ---------------------------------------------------------------------------

type ERParsedRow = {
  client: string;
  score: number;
};

type ERMatchedRow = ERParsedRow & {
  gcId: string | null;
  gcName: string | null;
  matchConfidence: 'exact' | 'fuzzy' | 'none';
};

function parseERCSV(text: string, gcs: GeneralContractor[]): ERMatchedRow[] {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('CSV appears to be empty or has no data rows.');

  const headerRow = rows[0].map((h) => h.trim().toLowerCase());
  const colClient = headerRow.findIndex((h) => h.includes('gc') || h === 'client' || h === 'name' || h === 'general contractor');
  const colScore = headerRow.findIndex(
    (h) => h.includes('score') || h.includes('relation') || h.includes('rating') || h.includes('est'),
  );

  // Fallback: assume col 0 = GC name, col 1 = score
  const clientIdx = colClient !== -1 ? colClient : 0;
  const scoreIdx = colScore !== -1 ? colScore : 1;

  const result: ERMatchedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const client = row[clientIdx]?.trim();
    if (!client) continue;
    const rawScore = parseFloat(row[scoreIdx]);
    if (isNaN(rawScore)) continue;
    const score = Math.min(5, Math.max(1, Math.round(rawScore)));

    const { gc, confidence } = matchGC(client, gcs);
    result.push({ client, score, gcId: gc?.id ?? null, gcName: gc?.name ?? null, matchConfidence: confidence });
  }

  if (result.length === 0) throw new Error('No valid rows found in the CSV.');
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CSVUploadScreen({ onBack, onComplete }: Props) {
  const [uploadType, setUploadType] = useState<UploadType>('buildingconnected');
  const [state, setState] = useState<UploadState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [bcMatched, setBcMatched] = useState<BCMatchedRow[]>([]);
  const [erMatched, setErMatched] = useState<ERMatchedRow[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [uploadedCount, setUploadedCount] = useState(0);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [thresholds, setThresholds] = useState<BidThresholds>(DEFAULT_THRESHOLDS);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchThresholds().then(setThresholds);
  }, []);

  function resetFile() {
    setState('idle');
    setBcMatched([]);
    setErMatched([]);
    setFileName('');
    setParseError('');
    setUploadError('');
    setShowUnmatched(false);
  }

  function handleTypeChange(t: UploadType) {
    setUploadType(t);
    resetFile();
  }

  const processFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setParseError('');
      setState('parsing');

      try {
        const text = await file.text();
        const { data: gcData, error: gcErr } = await supabase
          .from('general_contractors')
          .select('*');
        if (gcErr) throw new Error('Failed to load GC list from database.');
        const gcs = (gcData ?? []) as GeneralContractor[];

        if (uploadType === 'buildingconnected') {
          const rows = parseBCCSV(text, gcs, thresholds);
          setBcMatched(rows);
        } else {
          const rows = parseERCSV(text, gcs);
          setErMatched(rows);
        }
        setState('preview');
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse CSV.');
        setState('error');
      }
    },
    [uploadType, thresholds],
  );

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function handleConfirmBC() {
    const toUpdate = bcMatched.filter((r) => r.gcId !== null);
    if (toUpdate.length === 0) return;
    setState('uploading');
    setUploadError('');
    try {
      for (const r of toUpdate) {
        const { error } = await supabase
          .from('general_contractors')
          .update({
            award_probability: r.hitRatePct,
            hit_rate_dollar: r.hitRateDollar,
            total_bids_submitted_raw: r.totalBidsSubmitted,
          })
          .eq('id', r.gcId!);
        if (error) throw error;
      }
      setUploadedCount(toUpdate.length);
      setState('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setState('preview');
    }
  }

  async function handleConfirmER() {
    const toUpdate = erMatched.filter((r) => r.gcId !== null);
    if (toUpdate.length === 0) return;
    setState('uploading');
    setUploadError('');
    try {
      for (const r of toUpdate) {
        const { error } = await supabase
          .from('general_contractors')
          .update({ est_relationship: r.score })
          .eq('id', r.gcId!);
        if (error) throw error;
      }
      setUploadedCount(toUpdate.length);
      setState('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setState('preview');
    }
  }

  const matched = uploadType === 'buildingconnected' ? bcMatched : erMatched;
  const matchedCount = matched.filter((r) => r.gcId !== null).length;
  const unmatchedRows = matched.filter((r) => r.gcId === null);

  const doneLabel =
    uploadType === 'buildingconnected'
      ? `Updated Hit Rate (%), Hit Rate ($), and Total Bids for ${uploadedCount} GC${uploadedCount !== 1 ? 's' : ''}.`
      : `Updated Est Relation score for ${uploadedCount} GC${uploadedCount !== 1 ? 's' : ''}.`;

  return (
    <div className="min-h-[calc(100vh-80px)] px-4 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="text-white/40 hover:text-white text-sm flex items-center gap-1 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h2 className="text-2xl font-bold text-white">Upload CSV</h2>
          <p className="text-white/40 text-sm mt-1">
            Select the upload type, then drop or browse for your CSV file.
          </p>
        </div>

        {/* Upload type selector */}
        <div className="mb-6 flex gap-2">
          {(
            [
              { value: 'buildingconnected', label: 'BuildingConnected' },
              { value: 'est-relation', label: 'Est Relation' },
            ] as { value: UploadType; label: string }[]
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleTypeChange(opt.value)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                uploadType === opt.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:border-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Column guide */}
        {uploadType === 'buildingconnected' ? (
          <div className="mb-6 bg-white/[0.03] border border-white/10 rounded-xl px-5 py-4">
            <p className="text-white/50 text-xs uppercase tracking-wider font-medium mb-3">
              Required CSV Columns — "Client" sheet
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { col: 'A', name: 'Client', desc: 'GC name' },
                { col: 'B', name: '# Bids', desc: 'Bids submitted' },
                { col: 'C', name: '# Bids Won', desc: 'Bids awarded' },
                { col: 'E', name: 'Total Bids Submitted', desc: 'Dollar volume' },
                { col: 'F', name: 'Total Won', desc: 'Dollar won' },
              ].map((c) => (
                <div key={c.col} className="flex flex-col gap-0.5 bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-white/30 text-[10px] uppercase tracking-wider">Col {c.col}</span>
                  <span className="text-white text-xs font-semibold">{c.name}</span>
                  <span className="text-white/40 text-[11px]">{c.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-6 bg-white/[0.03] border border-white/10 rounded-xl px-5 py-4">
            <p className="text-white/50 text-xs uppercase tracking-wider font-medium mb-3">
              Required CSV Columns — Est Relation
            </p>
            <div className="grid grid-cols-2 gap-2 max-w-xs">
              {[
                { col: 'A', name: 'GC Name', desc: 'General contractor name' },
                { col: 'B', name: 'Score', desc: '1–5 rating' },
              ].map((c) => (
                <div key={c.col} className="flex flex-col gap-0.5 bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-white/30 text-[10px] uppercase tracking-wider">Col {c.col}</span>
                  <span className="text-white text-xs font-semibold">{c.name}</span>
                  <span className="text-white/40 text-[11px]">{c.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-white/30 text-xs mt-3">
              GCs not present in this CSV will keep their existing Est Relation score.
            </p>
          </div>
        )}

        {/* Drop zone */}
        {(state === 'idle' || state === 'error') && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl px-8 py-14 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
              dragOver
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
            }`}
          >
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
              <Upload className="w-7 h-7 text-white/30" />
            </div>
            <div className="text-center">
              <p className="text-white font-semibold">Drop your CSV here</p>
              <p className="text-white/40 text-sm mt-1">or click to browse</p>
            </div>
            {state === 'error' && parseError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 max-w-md text-left">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{parseError}</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFilePick}
            />
          </div>
        )}

        {/* Parsing */}
        {state === 'parsing' && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white/50 text-sm">Parsing {fileName}…</p>
          </div>
        )}

        {/* Preview */}
        {state === 'preview' && (
          <div className="flex flex-col gap-6">
            {/* Summary bar */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5">
                <FileText className="w-4 h-4 text-white/40" />
                <span className="text-white/70 text-sm">{fileName}</span>
                <button
                  onClick={resetFile}
                  className="text-white/30 hover:text-white ml-2 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-green-400">
                <CheckCircle className="w-4 h-4" />
                {matchedCount} GC{matchedCount !== 1 ? 's' : ''} matched
              </div>
              {unmatchedRows.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-yellow-400">
                  <AlertTriangle className="w-4 h-4" />
                  {unmatchedRows.length} unmatched (will be skipped)
                </div>
              )}
            </div>

            {uploadError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{uploadError}</p>
              </div>
            )}

            {/* BuildingConnected preview table */}
            {uploadType === 'buildingconnected' && (
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02]">
                  <p className="text-white/50 text-xs uppercase tracking-wider font-medium">
                    Preview — {matchedCount} rows will be updated
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="bg-white/[0.03] border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 text-left font-medium">CSV Client Name</th>
                        <th className="px-4 py-3 text-left font-medium">Matched GC</th>
                        <th className="px-4 py-3 text-center font-medium"># Bids</th>
                        <th className="px-4 py-3 text-center font-medium">Hit Rate (%)</th>
                        <th className="px-4 py-3 text-center font-medium">Total Submitted</th>
                        <th className="px-4 py-3 text-center font-medium">Hit Rate ($)</th>
                        <th className="px-4 py-3 text-center font-medium">Bids Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {bcMatched
                        .filter((r) => r.gcId !== null)
                        .map((row, i) => (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3 text-white/60 text-xs">{row.client}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-white text-sm font-medium">{row.gcName}</span>
                                {row.matchConfidence === 'fuzzy' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 font-medium uppercase tracking-wider">
                                    fuzzy
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-white/60 tabular-nums">{row.bids}</td>
                            <td className="px-4 py-3 text-center tabular-nums">
                              <span className={SCORE_COLOR(row.hitRatePct * 5)}>{fmtPct(row.hitRatePct)}</span>
                            </td>
                            <td className="px-4 py-3 text-center text-white/60 tabular-nums">
                              {fmtDollar(row.totalBidsSubmitted)}
                            </td>
                            <td className="px-4 py-3 text-center tabular-nums">
                              <span className={SCORE_COLOR(row.hitRateDollar * 5)}>{fmtPct(row.hitRateDollar)}</span>
                            </td>
                            <td className="px-4 py-3 text-center tabular-nums">
                              <span className={SCORE_COLOR(row.totalBidsScore)}>{row.totalBidsScore}.0</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Est Relation preview table */}
            {uploadType === 'est-relation' && (
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02]">
                  <p className="text-white/50 text-xs uppercase tracking-wider font-medium">
                    Preview — {matchedCount} rows will be updated
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[400px]">
                    <thead>
                      <tr className="bg-white/[0.03] border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 text-left font-medium">CSV Name</th>
                        <th className="px-4 py-3 text-left font-medium">Matched GC</th>
                        <th className="px-4 py-3 text-center font-medium">Est Relation Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {erMatched
                        .filter((r) => r.gcId !== null)
                        .map((row, i) => (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3 text-white/60 text-xs">{row.client}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-white text-sm font-medium">{row.gcName}</span>
                                {row.matchConfidence === 'fuzzy' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 font-medium uppercase tracking-wider">
                                    fuzzy
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center tabular-nums">
                              <span className={SCORE_COLOR(row.score)}>{row.score}.0</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Unmatched collapsible */}
            {unmatchedRows.length > 0 && (
              <div className="rounded-xl border border-yellow-500/20 overflow-hidden">
                <button
                  onClick={() => setShowUnmatched((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-yellow-400 text-sm font-medium">
                      {unmatchedRows.length} CSV row{unmatchedRows.length !== 1 ? 's' : ''} could not be
                      matched to a GC — will be skipped
                    </span>
                  </div>
                  {showUnmatched ? (
                    <ChevronUp className="w-4 h-4 text-yellow-400/50" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-yellow-400/50" />
                  )}
                </button>
                {showUnmatched && (
                  <div className="divide-y divide-white/5">
                    {unmatchedRows.map((row, i) => (
                      <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                        <span className="text-white/40 text-sm">{row.client}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={uploadType === 'buildingconnected' ? handleConfirmBC : handleConfirmER}
                disabled={matchedCount === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" />
                Confirm &amp; Upload {matchedCount} GC{matchedCount !== 1 ? 's' : ''}
              </button>
              <button
                onClick={resetFile}
                className="px-5 py-2.5 border border-white/10 rounded-lg text-white/40 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Uploading */}
        {state === 'uploading' && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white/50 text-sm">Updating GC records…</p>
          </div>
        )}

        {/* Done */}
        {state === 'done' && (
          <div className="flex flex-col items-center gap-6 py-20">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-bold">Upload Complete</p>
              <p className="text-white/40 text-sm mt-2">{doneLabel}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onComplete}
                className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Back to Dashboard
              </button>
              <button
                onClick={() => { resetFile(); setState('idle'); }}
                className="px-5 py-2.5 border border-white/10 rounded-lg text-white/40 hover:text-white text-sm transition-colors"
              >
                Upload Another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
