import { HardHat, BarChart2 } from 'lucide-react';

type Props = {
  onSelectPM: () => void;
  onSelectEstimator: () => void;
};

export default function LandingScreen({ onSelectPM, onSelectEstimator }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-6 py-12">
      <div className="w-full max-w-md">
        <p className="text-white/40 text-sm font-medium tracking-widest uppercase text-center mb-10">
          Select Your Role
        </p>
        <div className="flex flex-col gap-4">
          <button
            onClick={onSelectPM}
            className="group flex items-center gap-5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-brand-500/60 rounded-xl px-6 py-6 transition-all duration-200 text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-brand-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-500/30 transition-colors">
              <HardHat className="w-6 h-6 text-brand-500" />
            </div>
            <div>
              <p className="text-white font-semibold text-lg leading-tight">Project Manager</p>
              <p className="text-white/40 text-sm mt-0.5">Submit GC ratings and view reports</p>
            </div>
            <div className="ml-auto text-white/20 group-hover:text-brand-500 transition-colors text-xl">›</div>
          </button>

          <button
            onClick={onSelectEstimator}
            className="group flex items-center gap-5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-brand-500/60 rounded-xl px-6 py-6 transition-all duration-200 text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-brand-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-500/30 transition-colors">
              <BarChart2 className="w-6 h-6 text-brand-500" />
            </div>
            <div>
              <p className="text-white font-semibold text-lg leading-tight">Estimator</p>
              <p className="text-white/40 text-sm mt-0.5">View GC performance dashboard</p>
            </div>
            <div className="ml-auto text-white/20 group-hover:text-brand-500 transition-colors text-xl">›</div>
          </button>
        </div>
      </div>
    </div>
  );
}
