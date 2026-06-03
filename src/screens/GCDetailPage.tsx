import { useState, useEffect } from 'react';
import { ArrowLeft, CreditCard as Edit2 } from 'lucide-react';
import { supabase, type GeneralContractor, type Rating, type ProjectManager } from '../lib/supabase';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import AddGCModal from '../components/AddGCModal';
import { buildGCRow } from './GCDashboard';

type Props = {
  gcId: string;
  onBack: () => void;
  onGCUpdated?: (gc: GeneralContractor) => void;
};

type RatingWithPM = Rating & { pm_name: string };

const SCORE_FIELDS: { key: keyof Rating; label: string }[] = [
  { key: 'payment_timeline', label: 'Payment Timeline' },
  { key: 'co_approval_timeline', label: 'CO Approval' },
  { key: 'co_negotiations', label: 'CO Negotiations' },
  { key: 'contract_terms', label: 'Contract Terms' },
  { key: 'conflict_mitigation', label: 'Conflict Mitigation' },
  { key: 'schedule_trade_stacking', label: 'Schedule (Stacking)' },
  { key: 'schedule_accuracy', label: 'Schedule (Accuracy)' },
  { key: 'site_control', label: 'Site Control' },
  { key: 'relationship', label: 'PM Relation' },
];

function ScoreBadge({ value }: { value: number }) {
  const color =
    value >= 3.5 ? 'text-green-400' :
    value >= 2 ? 'text-yellow-400' : 'text-red-400';
  return (
    <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
  );
}

function avg(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export default function GCDetailPage({ gcId, onBack, onGCUpdated }: Props) {
  const [gc, setGc] = useState<GeneralContractor | null>(null);
  const [ratings, setRatings] = useState<RatingWithPM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEditGCModal, setShowEditGCModal] = useState(false);

  useEffect(() => { fetchData(); }, [gcId]);

  async function fetchData() {
    setLoading(true);
    setError('');
    const [gcRes, ratingsRes, pmsRes] = await Promise.all([
      supabase.from('general_contractors').select('*').eq('id', gcId).maybeSingle(),
      supabase.from('ratings').select('*').eq('gc_id', gcId).order('created_at', { ascending: false }),
      supabase.from('project_managers').select('*'),
    ]);

    if (gcRes.error || ratingsRes.error || pmsRes.error) {
      setError('Failed to load GC data.');
      setLoading(false);
      return;
    }

    const gcData = gcRes.data as GeneralContractor | null;
    const ratingsData = (ratingsRes.data ?? []) as Rating[];
    const pmsData = (pmsRes.data ?? []) as ProjectManager[];

    const pmMap = new Map(pmsData.map((p) => [p.id, p.name]));
    const enriched: RatingWithPM[] = ratingsData.map((r) => ({
      ...r,
      pm_name: pmMap.get(r.pm_id) ?? 'Unknown',
    }));

    setGc(gcData);
    setRatings(enriched);
    setLoading(false);
  }

  function handleGCEdited(updated: GeneralContractor) {
    setGc((prev) => prev ? { ...prev, name: updated.name, aliases: updated.aliases } : prev);
    setShowEditGCModal(false);
    onGCUpdated?.(updated);
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
        <LoadingSpinner message="Loading GC details..." />
      </div>
    );
  }

  if (error || !gc) {
    return (
      <div className="min-h-[calc(100vh-80px)] px-6 py-10 max-w-4xl mx-auto">
        <button onClick={onBack} className="text-white/40 hover:text-white text-sm flex items-center gap-2 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <ErrorMessage message={error || 'GC not found.'} />
      </div>
    );
  }

  const row = buildGCRow(gc, ratings);
  const catValues = SCORE_FIELDS.map((f) => row[f.key as keyof typeof row] as number);
  const overallScore = ratings.length > 0 ? avg(catValues.filter((v) => v > 0)) : null;

  return (
    <div className="min-h-[calc(100vh-80px)] px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={onBack}
          className="text-white/40 hover:text-white text-sm flex items-center gap-2 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="mb-8">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-3xl font-bold text-white">{gc.name}</h2>
              {gc.aliases ? (
                <p className="text-white/40 text-sm mt-1">
                  Also known as: <span className="text-white/60">{gc.aliases}</span>
                </p>
              ) : (
                <p className="text-white/20 text-sm mt-1 italic">No aliases</p>
              )}
            </div>
            <button
              onClick={() => setShowEditGCModal(true)}
              className="flex-shrink-0 mt-1 flex items-center gap-1.5 px-3 py-1.5 border border-white/10 rounded-lg text-white/40 hover:text-white hover:border-white/20 text-xs transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </button>
          </div>
          <p className="text-white/30 text-xs mt-2 uppercase tracking-wider">
            {ratings.length} report{ratings.length !== 1 ? 's' : ''} submitted
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          <ScoreCard
            label="Overall Score"
            value={overallScore != null ? overallScore.toFixed(2) : '—'}
            highlight
          />
          <ScoreCard
            label="Avg. Category Score"
            value={ratings.length > 0 ? avg(catValues).toFixed(2) : '—'}
          />
          <ScoreCard
            label="Reports"
            value={String(ratings.length)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col gap-6">
            {ratings.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10">
                  <p className="text-white/60 text-xs uppercase tracking-wider font-medium">Category Averages</p>
                </div>
                <div className="divide-y divide-white/5">
                  {SCORE_FIELDS.map((f) => {
                    const val = row[f.key as keyof typeof row] as number;
                    return (
                      <div key={f.key} className="px-5 py-2.5 flex items-center justify-between">
                        <p className="text-white/60 text-xs">{f.label}</p>
                        <span className={`text-sm font-semibold tabular-nums ${
                          val >= 4.5 ? 'text-green-400' :
                          val >= 3.5 ? 'text-white' :
                          val >= 2.5 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {val.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <p className="text-white/60 text-xs uppercase tracking-wider font-medium">Submitted Reports</p>
              </div>

              {ratings.length === 0 ? (
                <div className="px-5 py-10 text-center text-white/30">
                  <p>No reports submitted yet for this GC.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {ratings.map((r) => (
                    <div key={r.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-white font-semibold text-sm">{r.job_number}</p>
                          {r.job_name && (
                            <p className="text-white/50 text-xs mt-0.5">{r.job_name}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-white/40 text-xs">{r.pm_name}</p>
                          <p className="text-white/25 text-xs mt-0.5">
                            {new Date(r.created_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {SCORE_FIELDS.map((f) => {
                          const val = r[f.key as keyof Rating] as number;
                          return (
                            <div key={f.key} className="flex items-center justify-between bg-white/3 rounded px-2.5 py-1.5">
                              <p className="text-white/40 text-[11px]">{f.label}</p>
                              <ScoreBadge value={val} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showEditGCModal && gc && (
        <AddGCModal
          editGC={gc}
          onSaved={handleGCEdited}
          onClose={() => setShowEditGCModal(false)}
        />
      )}
    </div>
  );
}

function ScoreCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'bg-brand-500/10 border-brand-500/30' : 'bg-white/5 border-white/10'}`}>
      <p className="text-white/40 text-xs uppercase tracking-wider font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${highlight ? 'text-brand-400' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}
