import { ClipboardList, BarChart2, LogOut } from 'lucide-react';
import { type ProjectManager } from '../lib/supabase';

type Props = {
  pm: ProjectManager;
  confirmationMessage: string;
  onAddReport: () => void;
  onViewDashboard: () => void;
  onBack: () => void;
};

export default function PMHomeScreen({ pm, confirmationMessage, onAddReport, onViewDashboard, onBack }: Props) {
  return (
    <div className="min-h-[calc(100vh-80px)] px-6 py-10">
      <div className="max-w-md mx-auto">
        <button onClick={onBack} className="text-white/40 hover:text-white text-sm mb-6 flex items-center gap-1 transition-colors">
          ← Change Name
        </button>

        {confirmationMessage && (
          <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm">
            {confirmationMessage}
          </div>
        )}

        <div className="mb-10">
          <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-1">Logged in as</p>
          <h2 className="text-3xl font-bold text-white">{pm.name}</h2>
        </div>

        <div className="flex flex-col gap-4">
          <button
            onClick={onAddReport}
            className="group flex items-center gap-5 bg-brand-500 hover:bg-brand-600 rounded-xl px-6 py-6 transition-all duration-200 text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-lg leading-tight">Add a GC Report</p>
              <p className="text-white/70 text-sm mt-0.5">Rate a general contractor</p>
            </div>
            <div className="ml-auto text-white/50 group-hover:text-white transition-colors text-xl">›</div>
          </button>

          <button
            onClick={onViewDashboard}
            className="group flex items-center gap-5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-brand-500/60 rounded-xl px-6 py-6 transition-all duration-200 text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-brand-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-500/30 transition-colors">
              <BarChart2 className="w-6 h-6 text-brand-500" />
            </div>
            <div>
              <p className="text-white font-semibold text-lg leading-tight">View GC Reports</p>
              <p className="text-white/40 text-sm mt-0.5">Browse the estimator dashboard</p>
            </div>
            <div className="ml-auto text-white/20 group-hover:text-brand-500 transition-colors text-xl">›</div>
          </button>
        </div>
      </div>
    </div>
  );
}
