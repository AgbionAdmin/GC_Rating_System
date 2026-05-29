import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { supabase, type GeneralContractor } from '../lib/supabase';
import ErrorMessage from './ErrorMessage';

type Props = {
  onClose: () => void;
  onSaved: (gc: GeneralContractor) => void;
  initialName?: string;
  // Edit mode — pass the full GC to edit
  editGC?: GeneralContractor;
};

export default function AddGCModal({ onClose, onSaved, initialName = '', editGC }: Props) {
  const isEdit = !!editGC;
  const [name, setName] = useState(editGC ? editGC.name : initialName);
  const [aliases, setAliases] = useState(editGC ? (editGC.aliases ?? '') : '');
  const [showAwardProb, setShowAwardProb] = useState(false);
  const [awardProb, setAwardProb] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    let parsedProb: number | null = null;
    if (showAwardProb && awardProb.trim()) {
      const n = parseFloat(awardProb);
      if (isNaN(n) || n < 0 || n > 1) {
        setError('Award Probability must be a value between 0 and 1 (e.g. 0.75).');
        return;
      }
      parsedProb = n;
    }

    setSaving(true);
    setError('');

    if (isEdit && editGC) {
      const updatePayload: Partial<GeneralContractor> = {
        name: trimmedName,
        aliases: aliases.trim() || null,
      };
      if (showAwardProb) {
        (updatePayload as Record<string, unknown>).award_probability = parsedProb;
      }

      const { data, error: updateError } = await supabase
        .from('general_contractors')
        .update(updatePayload)
        .eq('id', editGC.id)
        .select()
        .maybeSingle();

      setSaving(false);

      if (updateError) {
        setError(
          updateError.message.includes('unique')
            ? 'A GC with that name already exists.'
            : 'Failed to update GC. Please try again.'
        );
        return;
      }

      if (data) onSaved(data as GeneralContractor);
    } else {
      const { data, error: insertError } = await supabase
        .from('general_contractors')
        .insert({
          name: trimmedName,
          aliases: aliases.trim() || null,
          award_probability: parsedProb,
        })
        .select()
        .maybeSingle();

      setSaving(false);

      if (insertError) {
        setError(
          insertError.message.includes('unique')
            ? 'A GC with that name already exists.'
            : 'Failed to save GC. Please try again.'
        );
        return;
      }

      if (data) onSaved(data as GeneralContractor);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a2d45] border border-white/10 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">
            {isEdit ? 'Edit General Contractor' : 'Add General Contractor'}
          </h3>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-white/60 text-xs uppercase tracking-wider font-medium mb-2">
              Official GC Name <span className="text-brand-500">*</span>
            </label>
            <input
              ref={firstInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full legal name"
              className="w-full bg-white/5 border border-white/10 focus:border-brand-500/60 rounded-lg px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-white/60 text-xs uppercase tracking-wider font-medium mb-2">
              Aliases <span className="text-white/20">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="e.g. ABC, ABC Const, A.B.C."
              className="w-full bg-white/5 border border-white/10 focus:border-brand-500/60 rounded-lg px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none transition-colors"
            />
          </div>

          {/* Award Probability — opt-in, only show in add mode */}
          {!isEdit && (
            <div>
              <button
                type="button"
                onClick={() => { setShowAwardProb((v) => !v); setAwardProb(''); }}
                className="flex items-center gap-2 text-brand-500 hover:text-brand-400 text-sm font-medium transition-colors"
              >
                <span className="w-4 h-4 rounded border border-brand-500 flex items-center justify-center text-xs">
                  {showAwardProb ? '✓' : ''}
                </span>
                Set Award Probability
              </button>

              {showAwardProb && (
                <div className="mt-3">
                  <label className="block text-white/60 text-xs uppercase tracking-wider font-medium mb-2">
                    Award Probability <span className="text-white/30">(0–1)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={awardProb}
                    onChange={(e) => setAwardProb(e.target.value)}
                    placeholder="e.g. 0.75"
                    className="w-full bg-white/5 border border-white/10 focus:border-brand-500/60 rounded-lg px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none transition-colors"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className="mt-4"><ErrorMessage message={error} /></div>}

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 text-sm transition-colors"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save GC'}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-3 border border-white/10 rounded-lg text-white/50 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
