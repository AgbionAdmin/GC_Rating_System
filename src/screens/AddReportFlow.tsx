import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { supabase, type ProjectManager, type GeneralContractor } from '../lib/supabase';
import ErrorMessage from '../components/ErrorMessage';
import AddGCModal from '../components/AddGCModal';

type Props = {
  pm: ProjectManager;
  onComplete: (gcName: string) => void;
  onBack: () => void;
  onHome: () => void;
};

type FormState = {
  job_number: string;
  job_name: string;
  gc_id: string;
  gc_name: string;
  payment_timeline: number;
  co_approval_timeline: number;
  co_negotiations: number;
  contract_terms: number;
  conflict_mitigation: number;
  schedule_trade_stacking: number;
  schedule_accuracy: number;
  site_control: number;
  relationship: number;
  safety: number;
};

const RATING_QUESTIONS: { key: keyof FormState; label: string; description: string }[] = [
  {
    key: 'payment_timeline',
    label: 'Payment Timeline',
    description: 'How consistently and promptly the GC processes and releases payments to subs. Includes adherence to contractual payment schedules and responsiveness when payments are delayed.',
  },
  {
    key: 'co_approval_timeline',
    label: 'Change Order Approval Timeline',
    description: 'How quickly the GC reviews, approves, and executes change orders once submitted.',
  },
  {
    key: 'co_negotiations',
    label: 'Change Order Negotiations',
    description: 'How fairly and reasonably the GC negotiates CO pricing and scope.',
  },
  {
    key: 'contract_terms',
    label: 'Contract Terms',
    description: 'The fairness and reasonableness of the subcontract language.',
  },
  {
    key: 'conflict_mitigation',
    label: 'Conflict Mitigation',
    description: 'How effectively the GC identifies, addresses, and resolves disputes or issues on the job before they escalate.',
  },
  {
    key: 'schedule_trade_stacking',
    label: 'Schedule Management – Trade Stacking',
    description: 'How well the GC sequences trades to avoid overcrowding work areas.',
  },
  {
    key: 'schedule_accuracy',
    label: 'Schedule Management – Accuracy',
    description: "How realistic and reliable the GC's published schedules are.",
  },
  {
    key: 'site_control',
    label: 'Site Control',
    description: "The GC's management of the physical site.",
  },
  {
    key: 'relationship',
    label: 'Relationship',
    description: "The general working relationship with the GC's project team.",
  },
  {
    key: 'safety',
    label: 'Safety',
    description: "The GC's commitment to jobsite safety practices, protocols, and incident prevention.",
  },
];

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Below Average',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

const INITIAL_FORM: FormState = {
  job_number: '',
  job_name: '',
  gc_id: '',
  gc_name: '',
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
};

// Steps: 0=job info, 1=gc select, 2..11=questions (10 total), 12=review
const TOTAL_STEPS = 13;

export default function AddReportFlow({ pm, onComplete, onBack, onHome }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // GC search state
  const [gcSearch, setGcSearch] = useState('');
  const [gcResults, setGcResults] = useState<GeneralContractor[]>([]);
  const [gcLoading, setGcLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddGCModal, setShowAddGCModal] = useState(false);
  const [pendingGCName, setPendingGCName] = useState('');
  const [selectedGC, setSelectedGC] = useState<GeneralContractor | null>(null);
  const [editingGC, setEditingGC] = useState<GeneralContractor | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter') return;
      // Don't intercept Enter inside the GC dropdown or modals
      if (showDropdown || showAddGCModal) return;
      if (step === 12) return; // review step uses its own submit button
      if (canAdvanceStep()) {
        e.preventDefault();
        setError('');
        setStep((s) => s + 1);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form, showDropdown, showAddGCModal]);

  async function searchGCs(query: string) {
    if (!query.trim()) {
      setGcResults([]);
      setShowDropdown(false);
      return;
    }
    setGcLoading(true);
    const { data } = await supabase
      .from('general_contractors')
      .select('*')
      .order('name');
    setGcLoading(false);
    if (data) {
      const q = query.toLowerCase();
      const filtered = (data as GeneralContractor[]).filter(
        (gc) =>
          gc.name.toLowerCase().includes(q) ||
          (gc.aliases && gc.aliases.toLowerCase().includes(q))
      );
      setGcResults(filtered);
      setShowDropdown(true);
    }
  }

  function handleGCSearchChange(val: string) {
    setGcSearch(val);
    setForm((f) => ({ ...f, gc_id: '', gc_name: '' }));
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchGCs(val), 200);
  }

  function selectGC(gc: GeneralContractor) {
    setForm((f) => ({ ...f, gc_id: gc.id, gc_name: gc.name }));
    setGcSearch(gc.name);
    setSelectedGC(gc);
    setShowDropdown(false);
  }

  function handleGCSaved(gc: GeneralContractor) {
    selectGC(gc);
    setShowAddGCModal(false);
    setPendingGCName('');
  }

  function handleGCEdited(gc: GeneralContractor) {
    setForm((f) => ({ ...f, gc_name: gc.name }));
    setGcSearch(gc.name);
    setSelectedGC(gc);
    setEditingGC(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    const { error } = await supabase.from('ratings').insert({
      gc_id: form.gc_id,
      pm_id: pm.id,
      job_number: form.job_number,
      job_name: form.job_name || null,
      payment_timeline: form.payment_timeline,
      co_approval_timeline: form.co_approval_timeline,
      co_negotiations: form.co_negotiations,
      contract_terms: form.contract_terms,
      conflict_mitigation: form.conflict_mitigation,
      schedule_trade_stacking: form.schedule_trade_stacking,
      schedule_accuracy: form.schedule_accuracy,
      site_control: form.site_control,
      relationship: form.relationship,
      safety: form.safety,
    });
    setSubmitting(false);
    if (error) {
      setError('Failed to submit rating. Please try again.');
      return;
    }
    onComplete(form.gc_name);
  }

  function canAdvanceStep(): boolean {
    if (step === 0) return form.job_number.trim().length > 0;
    if (step === 1) return form.gc_id.length > 0;
    if (step >= 2 && step <= 11) {
      const q = RATING_QUESTIONS[step - 2];
      return (form[q.key] as number) > 0;
    }
    return true;
  }

  const questionIndex = step - 2;
  const currentQuestion = step >= 2 && step <= 11 ? RATING_QUESTIONS[questionIndex] : null;

  return (
    <div className="min-h-[calc(100vh-80px)] px-6 py-10 flex flex-col">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-white/30 mb-2">
            <span>Step {step + 1} of {TOTAL_STEPS}</span>
            {step >= 2 && step <= 11 && (
              <span>Question {questionIndex + 1} of 10</span>
            )}
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        {error && <div className="mb-4"><ErrorMessage message={error} /></div>}

        {/* Step 0: Job Info */}
        {step === 0 && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-2xl font-bold text-white mb-1">Job Information</h2>
            <p className="text-white/40 text-sm mb-8">Enter the job details for this rating.</p>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-white/60 text-xs uppercase tracking-wider font-medium mb-2">
                  Job Number <span className="text-brand-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.job_number}
                  onChange={(e) => setForm((f) => ({ ...f, job_number: e.target.value }))}
                  placeholder="e.g. 2024-0147"
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500/60 rounded-lg px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-white/60 text-xs uppercase tracking-wider font-medium mb-2">
                  Job Name <span className="text-white/20">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.job_name}
                  onChange={(e) => setForm((f) => ({ ...f, job_name: e.target.value }))}
                  placeholder="e.g. Main Street Office Complex"
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500/60 rounded-lg px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 1: GC Select */}
        {step === 1 && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-2xl font-bold text-white mb-1">Select General Contractor</h2>
            <p className="text-white/40 text-sm mb-8">Search by name or abbreviation.</p>
            <div ref={searchRef} className="relative">
              <input
                type="text"
                value={gcSearch}
                onChange={(e) => handleGCSearchChange(e.target.value)}
                onFocus={() => gcSearch && setShowDropdown(true)}
                placeholder="Search GC name or alias..."
                className="w-full bg-white/5 border border-white/10 focus:border-brand-500/60 rounded-lg px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none transition-colors"
              />
              {gcLoading && (
                <div className="absolute right-3 top-3">
                  <div className="w-4 h-4 border border-white/20 border-t-brand-500 rounded-full animate-spin" />
                </div>
              )}
              {form.gc_id && (
                <div className="mt-3 bg-brand-500/10 border border-brand-500/30 rounded-lg px-4 py-2.5 text-brand-400 text-sm flex items-center justify-between gap-3">
                  <span className="truncate">Selected: <strong>{form.gc_name}</strong></span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => selectedGC && setEditingGC(selectedGC)}
                      className="text-brand-400/60 hover:text-brand-300 transition-colors text-xs underline underline-offset-2"
                    >
                      Edit
                    </button>
                    <button onClick={() => { setForm((f) => ({ ...f, gc_id: '', gc_name: '' })); setGcSearch(''); setSelectedGC(null); }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              {showDropdown && !form.gc_id && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a2d45] border border-white/10 rounded-lg overflow-hidden shadow-xl z-20">
                  {gcResults.length === 0 && gcSearch.trim() && !gcLoading && (
                    <div className="px-4 py-3 text-white/40 text-sm">No results found.</div>
                  )}
                  {gcResults.map((gc) => (
                    <button
                      key={gc.id}
                      onClick={() => selectGC(gc)}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                    >
                      <p className="text-white text-sm font-medium">{gc.name}</p>
                      {gc.aliases && (
                        <p className="text-white/30 text-xs mt-0.5">{gc.aliases}</p>
                      )}
                    </button>
                  ))}
                  {gcSearch.trim() && (
                    <button
                      onClick={() => { setPendingGCName(gcSearch.trim()); setShowAddGCModal(true); setShowDropdown(false); }}
                      className="w-full text-left px-4 py-3 hover:bg-brand-500/10 text-brand-500 text-sm font-medium transition-colors border-t border-white/10"
                    >
                      + Add new GC: "{gcSearch.trim()}"
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Steps 2–10: Rating Questions */}
        {currentQuestion && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-2xl font-bold text-white mb-2">{currentQuestion.label}</h2>
            <p className="text-white/50 text-sm leading-relaxed mb-2">{currentQuestion.description}</p>
            <p className="text-white/25 text-xs mb-8">Rate from 1 (Poor) to 5 (Excellent)</p>
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4, 5].map((val) => {
                const selected = (form[currentQuestion.key] as number) === val;
                return (
                  <button
                    key={val}
                    onClick={() => setForm((f) => ({ ...f, [currentQuestion.key]: val }))}
                    className={`flex items-center gap-4 rounded-xl px-5 py-4 border transition-all duration-150 text-left ${
                      selected
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-white'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      selected ? 'bg-white/20 text-white' : 'bg-white/10 text-white/60'
                    }`}>
                      {val}
                    </div>
                    <span className={`font-medium ${selected ? 'text-white' : 'text-white/80'}`}>
                      {RATING_LABELS[val]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 11: Review */}
        {step === 12 && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-2xl font-bold text-white mb-1">Review & Submit</h2>
            <p className="text-white/40 text-sm mb-6">Confirm your rating before submitting.</p>
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-white/10 bg-white/5">
                <p className="text-white/40 text-xs uppercase tracking-wider font-medium">Job Details</p>
              </div>
              <div className="px-5 py-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-white/40 text-xs mb-1">Job Number</p>
                  <p className="text-white text-sm font-medium">{form.job_number}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-1">Job Name</p>
                  <p className="text-white text-sm font-medium">{form.job_name || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-white/40 text-xs mb-1">General Contractor</p>
                  <p className="text-white text-sm font-medium">{form.gc_name}</p>
                </div>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/10 bg-white/5">
                <p className="text-white/40 text-xs uppercase tracking-wider font-medium">Ratings</p>
              </div>
              <div className="divide-y divide-white/5">
                {RATING_QUESTIONS.map((q) => {
                  const val = form[q.key] as number;
                  return (
                    <div key={q.key} className="px-5 py-3 flex items-center justify-between">
                      <p className="text-white/70 text-sm">{q.label}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-brand-500 font-bold text-sm">{val}</span>
                        <span className="text-white/30 text-xs">/ 5 — {RATING_LABELS[val]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={() => {
              setError('');
              if (step === 0) { onBack(); } else { setStep((s) => s - 1); }
            }}
            className="px-5 py-3 border border-white/10 rounded-lg text-white/50 hover:text-white hover:border-white/20 text-sm transition-colors"
          >
            Back
          </button>
          {step < 12 ? (
            <button
              onClick={() => { setError(''); setStep((s) => s + 1); }}
              disabled={!canAdvanceStep()}
              className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 text-sm transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 text-sm transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Rating'}
            </button>
          )}
        </div>
      </div>

      {showAddGCModal && (
        <AddGCModal
          initialName={pendingGCName}
          onSaved={handleGCSaved}
          onClose={() => { setShowAddGCModal(false); setPendingGCName(''); }}
        />
      )}

      {editingGC && (
        <AddGCModal
          editGC={editingGC}
          onSaved={handleGCEdited}
          onClose={() => setEditingGC(null)}
        />
      )}
    </div>
  );
}
