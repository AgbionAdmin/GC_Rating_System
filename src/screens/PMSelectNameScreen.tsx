import { useState, useEffect } from 'react';
import { Plus, User, ChevronRight } from 'lucide-react';
import { supabase, type ProjectManager } from '../lib/supabase';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

type Props = {
  onSelect: (pm: ProjectManager) => void;
  onBack: () => void;
};

export default function PMSelectNameScreen({ onSelect, onBack }: Props) {
  const [pms, setPMs] = useState<ProjectManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPMs();
  }, []);

  async function fetchPMs() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('project_managers')
      .select('*')
      .order('name');
    if (error) {
      setError('Failed to load project managers.');
    } else {
      setPMs(data ?? []);
    }
    setLoading(false);
  }

  async function handleAddName() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    setError('');
    const { data, error } = await supabase
      .from('project_managers')
      .insert({ name: trimmed })
      .select()
      .maybeSingle();
    if (error) {
      setError(error.message.includes('unique') ? 'That name already exists.' : 'Failed to add name.');
      setSaving(false);
      return;
    }
    if (data) {
      onSelect(data as ProjectManager);
    }
    setSaving(false);
  }

  return (
    <div className="min-h-[calc(100vh-80px)] px-6 py-10">
      <div className="max-w-md mx-auto">
        <button onClick={onBack} className="text-white/40 hover:text-white text-sm mb-6 flex items-center gap-1 transition-colors">
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-white mb-1">Select Your Name</h2>
        <p className="text-white/40 text-sm mb-8">Choose your name to continue as a Project Manager.</p>

        {error && <div className="mb-4"><ErrorMessage message={error} /></div>}

        {loading ? (
          <LoadingSpinner />
        ) : (
          <div className="flex flex-col gap-2">
            {pms.map((pm) => (
              <button
                key={pm.id}
                onClick={() => onSelect(pm)}
                className="group flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-brand-500/40 rounded-lg px-5 py-4 transition-all duration-150 text-left"
              >
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-white/50" />
                </div>
                <span className="text-white font-medium flex-1">{pm.name}</span>
                <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-brand-500 transition-colors" />
              </button>
            ))}

            {!showAddInput ? (
              <button
                onClick={() => setShowAddInput(true)}
                className="group flex items-center gap-4 bg-transparent hover:bg-brand-500/10 border border-dashed border-white/20 hover:border-brand-500/60 rounded-lg px-5 py-4 transition-all duration-150 text-left mt-2"
              >
                <div className="w-9 h-9 rounded-full bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                  <Plus className="w-4 h-4 text-brand-500" />
                </div>
                <span className="text-brand-500 font-medium">Add My Name</span>
              </button>
            ) : (
              <div className="border border-brand-500/40 rounded-lg px-5 py-4 bg-brand-500/5 mt-2">
                <p className="text-white/60 text-xs mb-3 uppercase tracking-wider font-medium">Add your name</p>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddName()}
                  placeholder="Full name"
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-brand-500/60 mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddName}
                    disabled={saving || !newName.trim()}
                    className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-md py-2.5 text-sm transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save & Select'}
                  </button>
                  <button
                    onClick={() => { setShowAddInput(false); setNewName(''); }}
                    className="px-4 py-2.5 border border-white/10 rounded-md text-white/50 hover:text-white text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
