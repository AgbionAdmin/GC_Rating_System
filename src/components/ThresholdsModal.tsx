import { useState, useEffect } from 'react';
import { Settings, X, Save } from 'lucide-react';
import { type BidThresholds, fetchThresholds, saveThresholds } from '../lib/bidThresholds';

type Props = {
  onClose: () => void;
  onSaved: (t: BidThresholds) => void;
};

function fmtInput(n: number): string {
  if (n <= 1) return '';
  return String(n);
}

function parseDollar(s: string): number {
  const cleaned = s.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) || n <= 0 ? 0 : n;
}

function DollarInput({
  label,
  score,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  score: number;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 w-28 flex-shrink-0">
        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0
          ${score >= 4 ? 'bg-green-500/20 text-green-400' :
            score === 3 ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-red-500/20 text-red-400'}`}
        >
          {score}
        </div>
        <span className="text-white/60 text-sm">{label}</span>
      </div>
      <div className="flex-1 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none">$</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-6 pr-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500/60 transition-colors placeholder-white/20"
        />
      </div>
    </div>
  );
}

export default function ThresholdsModal({ onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tier2, setTier2] = useState('');
  const [tier3, setTier3] = useState('');
  const [tier4, setTier4] = useState('');
  const [tier5, setTier5] = useState('');

  useEffect(() => {
    fetchThresholds().then((t) => {
      setTier2(fmtInput(t.tier_2_min));
      setTier3(fmtInput(t.tier_3_min));
      setTier4(fmtInput(t.tier_4_min));
      setTier5(fmtInput(t.tier_5_min));
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    const t: BidThresholds = {
      tier_2_min: parseDollar(tier2) || 1,
      tier_3_min: parseDollar(tier3),
      tier_4_min: parseDollar(tier4),
      tier_5_min: parseDollar(tier5),
    };
    setSaving(true);
    await saveThresholds(t);
    setSaving(false);
    onSaved(t);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
              <Settings className="w-4 h-4 text-brand-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-base">Total Bids Thresholds</h3>
              <p className="text-white/40 text-xs mt-0.5">Minimum dollar amount to earn each score</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="mb-4 bg-white/[0.03] rounded-xl px-4 py-3">
                <p className="text-white/40 text-xs leading-relaxed">
                  Score <span className="text-red-400 font-medium">1</span> is assigned when Total Bids Submitted is $0. Set the minimum dollar thresholds for scores 2–5 below.
                </p>
              </div>
              <DollarInput label="Score 2" score={2} value={tier2} onChange={setTier2} placeholder="e.g. 1" />
              <DollarInput label="Score 3" score={3} value={tier3} onChange={setTier3} placeholder="e.g. 1,000,000" />
              <DollarInput label="Score 4" score={4} value={tier4} onChange={setTier4} placeholder="e.g. 5,000,000" />
              <DollarInput label="Score 5" score={5} value={tier5} onChange={setTier5} placeholder="e.g. 10,000,000" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="flex items-center gap-2 px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
