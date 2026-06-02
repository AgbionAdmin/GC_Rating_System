import { useState, useRef, useCallback } from 'react';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase, type GeneralContractor } from '../lib/supabase';

type Props = {
  onBack: () => void;
  onComplete: () => void;
};

type ParsedRow = {
  client: string;
  bids: number;
  bidsWon: number;
  totalBidsSubmitted: number;
  totalWin: number;
  hitRatePct: number;       // 0–1
  hitRateDollar: number;    // 0–1 ratio
  totalBidsScore: number;   // 1–5
};

type MatchedRow = ParsedRow & {
  gcId: string | null;
  gcName: string | null;
  matchConfidence: 'exact' | 'fuzzy' | 'none';
};

type UploadState = 'idle' | 'parsing' | 'preview' | 'uploading' | 'done' | 'error';

// Normalize for comparison
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchGC(client: string, gcs: GeneralContractor[]): { gc: GeneralContractor | null; confidence: 'exact' | 'fuzzy' | 'none' } {
  const norm = normalize(client);

  // Exact match on name or any alias
  for (const gc of gcs) {
    if (normalize(gc.name) === norm) return { gc, confidence: 'exact' };
    if (gc.aliases) {
      for (const alias of gc.aliases.split(/[,;]+/)) {
        if (normalize(alias.trim()) === norm) return { gc, confidence: 'exact' };
      }
    }
  }

  // Fuzzy: longest common substring ratio
  let best: GeneralContractor | null = null;
  let bestScore = 0;
  for (const gc of gcs) {
    const candidates = [gc.name, ...(gc.aliases ? gc.aliases.split(/[,;]+/).map((a) => a.trim()) : [])];
    for (const cand of candidates) {
      const cn = normalize(cand);
      // Check if one contains the other
      if (cn.includes(norm) || norm.includes(cn)) {
        const score = Math.min(cn.length, norm.length) / Math.max(cn.length, norm.length);
        if (score > bestScore) { bestScore = score; best = gc; }
      }
    }
  }
  if (best && bestScore >= 0.6) return { gc: best, confidence: 'fuzzy' };

  return { gc: null, confidence: 'none' };
}

function totalBidsToScore(dollars: number): number {
  if (dollars <= 0) return 1;
  if (dollars < 1_000_000) return 2;
  if (dollars < 5_000_000) return 3;
  if (dollars < 10_000_000) return 4;
  return 5;
}

function hitRateToRatio(bids: number, won: number): number {
  if (bids === 0) return 0;
  return won / bids;
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
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cols.push(cur); cur = '';
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

const SCORE_COLOR = (v: number) =>
  v >= 3.5 ? 'text-green-400' : v >= 2 ? 'text-yellow-400' : 'text-red-400';

export default function CSVUploadScreen({ onBack, onComplete }: Props) {
  const [state, setState] = useState<UploadState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [matched, setMatched] = useState<MatchedRow[]>([]);
  const [gcs, setGcs] = useState<GeneralContractor[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [uploadedCount, setUploadedCount] = useState(0);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setParseError('');
    setState('parsing');

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error('CSV appears to be empty or has no data rows.');

      const headerRow = rows[0].map((h) => h.trim().toLowerCase());

      // Flexible header matching
      const findCol = (names: string[]) => {
        for (const n of names) {
          const idx = headerRow.findIndex((h) => h === n.toLowerCase());
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const colClient = findCol(['client']);
      const colBids = findCol(['#bids', 'bids', 'number of bids']);
      const colBidsWon = findCol(['#bids won', 'bids won', 'number of bids won']);
      const colTotalSubmitted = findCol(['total bids submitted', 'total bids', 'bids submitted']);
      const colTotalWin = findCol(['total win', 'total wins', 'win total']);

      const missing: string[] = [];
      if (colClient === -1) missing.push('Client');
      if (colBids === -1) missing.push('#Bids');
      if (colBidsWon === -1) missing.push('#Bids Won');
      if (colTotalSubmitted === -1) missing.push('Total Bids Submitted');
      if (colTotalWin === -1) missing.push('Total Win');

      if (missing.length > 0) {
        throw new Error(`Missing required columns: ${missing.join(', ')}. Make sure you're uploading the "Client" sheet.`);
      }

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const client = row[colClient]?.trim();
        if (!client) continue;

        const bids = parseFloat(row[colBids]) || 0;
        if (bids === 0) continue; // skip GCs with 0 bids

        const bidsWon = parseFloat(row[colBidsWon]) || 0;
        const totalBidsSubmitted = parseDollar(row[colTotalSubmitted] ?? '0');
        const totalWin = parseDollar(row[colTotalWin] ?? '0');

        const hitRatePct = hitRateToRatio(bids, bidsWon);
        const hitRateDollar = totalBidsSubmitted > 0 ? totalWin / totalBidsSubmitted : 0;
        const totalBidsScore = totalBidsToScore(totalBidsSubmitted);

        parsed.push({ client, bids, bidsWon, totalBidsSubmitted, totalWin, hitRatePct, hitRateDollar, totalBidsScore });
      }

      if (parsed.length === 0) {
        throw new Error('No valid rows found (all rows had 0 bids or were empty).');
      }

      // Load GCs for matching
      const { data: gcData, error: gcErr } = await supabase.from('general_contractors').select('*');
      if (gcErr) throw new Error('Failed to load GC list from database.');

      const gcList = (gcData ?? []) as GeneralContractor[];
      setGcs(gcList);

      const matchedRows: MatchedRow[] = parsed.map((row) => {
        const { gc, confidence } = matchGC(row.client, gcList);
        return { ...row, gcId: gc?.id ?? null, gcName: gc?.name ?? null, matchConfidence: confidence };
      });

      setMatched(matchedRows);
      setState('preview');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse CSV.');
      setState('error');
    }
  }, []);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function handleConfirmUpload() {
    const toUpdate = matched.filter((r) => r.gcId !== null);
    if (toUpdate.length === 0) return;

    setState('uploading');
    setUploadError('');

    try {
      // Upsert in batches — overwrite hit rate fields only
      const updates = toUpdate.map((r) => ({
        id: r.gcId!,
        award_probability: r.hitRatePct,
        hit_rate_dollar: r.hitRateDollar,
        total_bids_submitted_raw: r.totalBidsSubmitted,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('general_contractors')
          .update({
            award_probability: update.award_probability,
            hit_rate_dollar: update.hit_rate_dollar,
            total_bids_submitted_raw: update.total_bids_submitted_raw,
          })
          .eq('id', update.id);
        if (error) throw error;
      }

      setUploadedCount(toUpdate.length);
      setState('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setState('preview');
    }
  }

  const matchedCount = matched.filter((r) => r.gcId !== null).length;
  const unmatchedRows = matched.filter((r) => r.gcId === null);

  return (
    <div className="min-h-[calc(100vh-80px)] px-4 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button onClick={onBack} className="text-white/40 hover:text-white text-sm flex items-center gap-1 transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h2 className="text-2xl font-bold text-white">Upload Bid Data CSV</h2>
          <p className="text-white/40 text-sm mt-1">
            Updates Hit Rate (%), Hit Rate ($), and Total Bids for matched GCs. Export the "Client" sheet as CSV before uploading.
          </p>
        </div>

        {/* Column guide */}
        <div className="mb-6 bg-white/[0.03] border border-white/10 rounded-xl px-5 py-4">
          <p className="text-white/50 text-xs uppercase tracking-wider font-medium mb-3">Required CSV Columns</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { col: 'A', name: 'Client', desc: 'GC name' },
              { col: 'B', name: '#Bids', desc: 'Bids submitted' },
              { col: 'C', name: '#Bids Won', desc: 'Bids awarded' },
              { col: 'E', name: 'Total Bids Submitted', desc: 'Dollar volume' },
              { col: 'F', name: 'Total Win', desc: 'Dollar won' },
            ].map((c) => (
              <div key={c.col} className="flex flex-col gap-0.5 bg-white/5 rounded-lg px-3 py-2">
                <span className="text-white/30 text-[10px] uppercase tracking-wider">Col {c.col}</span>
                <span className="text-white text-xs font-semibold">{c.name}</span>
                <span className="text-white/40 text-[11px]">{c.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        {(state === 'idle' || state === 'error') && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl px-8 py-14 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
              dragOver ? 'border-brand-500 bg-brand-500/5' : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
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
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFilePick} />
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
                <button onClick={() => { setState('idle'); setMatched([]); setFileName(''); }} className="text-white/30 hover:text-white ml-2 transition-colors">
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

            {/* Preview table */}
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
                      <th className="px-4 py-3 text-center font-medium">#Bids</th>
                      <th className="px-4 py-3 text-center font-medium">Hit Rate (%)</th>
                      <th className="px-4 py-3 text-center font-medium">Total Submitted</th>
                      <th className="px-4 py-3 text-center font-medium">Hit Rate ($)</th>
                      <th className="px-4 py-3 text-center font-medium">Bids Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {matched.filter((r) => r.gcId !== null).map((row, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-white/60 text-xs">{row.client}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-medium">{row.gcName}</span>
                            {row.matchConfidence === 'fuzzy' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 font-medium uppercase tracking-wider">fuzzy</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-white/60 tabular-nums">{row.bids}</td>
                        <td className="px-4 py-3 text-center tabular-nums">
                          <span className={SCORE_COLOR(row.hitRatePct * 5)}>{fmtPct(row.hitRatePct)}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-white/60 tabular-nums">{fmtDollar(row.totalBidsSubmitted)}</td>
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
                      {unmatchedRows.length} CSV client{unmatchedRows.length !== 1 ? 's' : ''} could not be matched to a GC — will be skipped
                    </span>
                  </div>
                  {showUnmatched ? <ChevronUp className="w-4 h-4 text-yellow-400/50" /> : <ChevronDown className="w-4 h-4 text-yellow-400/50" />}
                </button>
                {showUnmatched && (
                  <div className="divide-y divide-white/5">
                    {unmatchedRows.map((row, i) => (
                      <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                        <span className="text-white/40 text-sm">{row.client}</span>
                        <span className="text-white/20 text-xs">({row.bids} bids)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleConfirmUpload}
                disabled={matchedCount === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" />
                Confirm &amp; Upload {matchedCount} GC{matchedCount !== 1 ? 's' : ''}
              </button>
              <button
                onClick={() => { setState('idle'); setMatched([]); setFileName(''); }}
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
              <p className="text-white/40 text-sm mt-2">
                Updated Hit Rate (%), Hit Rate ($), and Total Bids for {uploadedCount} GC{uploadedCount !== 1 ? 's' : ''}.
              </p>
            </div>
            <button
              onClick={onComplete}
              className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
