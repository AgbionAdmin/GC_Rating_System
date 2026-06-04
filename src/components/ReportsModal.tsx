import { useState, useEffect, useRef } from 'react';
import { Mail, X, Plus, Trash2, Download, Send, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { GCRow } from '../screens/GCDashboard';

type Frequency = 'weekly' | 'biweekly' | 'monthly';

type Props = {
  onClose: () => void;
  rows: GCRow[];
};

const FREQUENCY_OPTIONS: { value: Frequency; label: string; desc: string }[] = [
  { value: 'weekly',   label: 'Weekly',    desc: 'Every Monday at 8 AM' },
  { value: 'biweekly', label: 'Bi-weekly', desc: 'Every other Monday at 8 AM' },
  { value: 'monthly',  label: 'Monthly',   desc: '1st of each month at 8 AM' },
];

function nextSendDate(frequency: Frequency, lastSentAt: string | null): string {
  const base = lastSentAt ? new Date(lastSentAt) : new Date();
  const next = new Date(base);
  if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (frequency === 'biweekly') {
    next.setDate(next.getDate() + 14);
  } else {
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
  }
  return next.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReportsModal({ onClose, rows }: Props) {
  const [subscribers, setSubscribers] = useState<{ id: string; email: string }[]>([]);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [savingFreq, setSavingFreq] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const [subRes, settingsRes] = await Promise.all([
        supabase.from('report_subscribers').select('id, email').order('created_at'),
        supabase.from('report_settings').select('frequency, last_sent_at').eq('id', 1).maybeSingle(),
      ]);
      if (subRes.data) setSubscribers(subRes.data);
      if (settingsRes.data) {
        setFrequency(settingsRes.data.frequency as Frequency);
        setLastSentAt(settingsRes.data.last_sent_at);
      }
      setLoadingData(false);
    }
    load();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  async function handleAddSubscriber() {
    const email = emailInput.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setAddError('Please enter a valid email address.');
      return;
    }
    if (subscribers.some((s) => s.email === email)) {
      setAddError('This email is already on the list.');
      return;
    }
    setAdding(true);
    setAddError('');
    const { data, error } = await supabase
      .from('report_subscribers')
      .insert({ email })
      .select('id, email')
      .maybeSingle();
    if (error || !data) {
      setAddError('Failed to add subscriber. Please try again.');
    } else {
      setSubscribers((prev) => [...prev, data]);
      setEmailInput('');
      inputRef.current?.focus();
    }
    setAdding(false);
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    await supabase.from('report_subscribers').delete().eq('id', id);
    setSubscribers((prev) => prev.filter((s) => s.id !== id));
    setRemovingId(null);
  }

  async function handleFrequencyChange(f: Frequency) {
    setFrequency(f);
    setSavingFreq(true);
    await supabase
      .from('report_settings')
      .update({ frequency: f, updated_at: new Date().toISOString() })
      .eq('id', 1);
    setSavingFreq(false);
  }

  async function handleDownload() {
    const { generatePeriodicReport } = await import('../lib/generatePeriodicReport');
    generatePeriodicReport(rows);
  }

  async function handleSendNow() {
    if (subscribers.length === 0) return;
    setSendingNow(true);
    setSendResult(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-gc-report?force=true`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({}),
        },
      );
      if (res.ok) {
        setSendResult('success');
        const now = new Date().toISOString();
        setLastSentAt(now);
      } else {
        setSendResult('error');
      }
    } catch {
      setSendResult('error');
    }
    setSendingNow(false);
  }

  const hasRatedRows = rows.filter((r) => r.rating_count > 0).length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a2d45] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
              <Mail className="w-4 h-4 text-brand-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-base">Reports</h3>
              <p className="text-white/40 text-xs mt-0.5">Manage delivery and download the PDF report</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {loadingData ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Frequency */}
              <div>
                <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">
                  Delivery Frequency
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleFrequencyChange(opt.value)}
                      disabled={savingFreq}
                      className={`relative px-3 py-3 rounded-xl border text-left transition-all ${
                        frequency === opt.value
                          ? 'bg-brand-500/15 border-brand-500/50 text-white'
                          : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
                      }`}
                    >
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs mt-0.5 opacity-60">{opt.desc}</p>
                      {frequency === opt.value && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-white/25 text-xs mt-2">
                  Next scheduled send: {nextSendDate(frequency, lastSentAt)}
                  {lastSentAt && (
                    <> &middot; Last sent {new Date(lastSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                  )}
                </p>
              </div>

              {/* Subscribers */}
              <div>
                <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">
                  Subscriber List
                  {subscribers.length > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-white/10 text-white/40 rounded text-xs font-normal normal-case">
                      {subscribers.length}
                    </span>
                  )}
                </p>

                {/* Add email row */}
                <div className="flex gap-2 mb-3">
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      type="email"
                      value={emailInput}
                      onChange={(e) => { setEmailInput(e.target.value); setAddError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubscriber(); }}
                      placeholder="name@company.com"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500/60 transition-colors placeholder-white/20"
                    />
                  </div>
                  <button
                    onClick={handleAddSubscriber}
                    disabled={adding || !emailInput.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-sm rounded-lg transition-colors flex-shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>

                {addError && (
                  <p className="text-red-400 text-xs mb-3 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {addError}
                  </p>
                )}

                {subscribers.length === 0 ? (
                  <div className="bg-white/[0.03] rounded-xl px-4 py-5 text-center">
                    <p className="text-white/30 text-sm">No subscribers yet.</p>
                    <p className="text-white/20 text-xs mt-1">Add email addresses above to enable automated delivery.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {subscribers.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between px-3 py-2 bg-white/[0.03] rounded-lg group"
                      >
                        <span className="text-white/70 text-sm">{s.email}</span>
                        <button
                          onClick={() => handleRemove(s.id)}
                          disabled={removingId === s.id}
                          className="text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30"
                          title="Remove subscriber"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex-shrink-0">
          {/* Send result feedback */}
          {sendResult === 'success' && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
              <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <p className="text-green-400 text-xs">Report sent to all subscribers.</p>
            </div>
          )}
          {sendResult === 'error' && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-xs">Send failed. Check your Resend configuration.</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSendNow}
              disabled={sendingNow || subscribers.length === 0 || !hasRatedRows}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium rounded-lg transition-colors flex-shrink-0"
              title={subscribers.length === 0 ? 'Add subscribers first' : 'Send report to all subscribers now'}
            >
              <Send className="w-3.5 h-3.5" />
              {sendingNow ? 'Sending...' : 'Send Now'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!hasRatedRows}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex-1 justify-center"
            >
              <Download className="w-4 h-4" />
              Download Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
