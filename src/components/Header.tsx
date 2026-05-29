type HeaderProps = {
  subtitle?: string;
  onHome?: () => void;
};

export default function Header({ subtitle = 'GC Rating System', onHome }: HeaderProps) {
  return (
    <header className="w-full bg-navy-900 border-b border-white/10 px-6 py-5">
      <div className="max-w-6xl mx-auto">
        <div className="inline-block">
          {onHome ? (
            <button
              onClick={onHome}
              className="text-2xl font-bold text-white tracking-tight leading-none hover:text-white/80 transition-colors text-left"
            >
              Legacy Mechanical
            </button>
          ) : (
            <h1 className="text-2xl font-bold text-white tracking-tight leading-none">
              Legacy Mechanical
            </h1>
          )}
          <div className="h-0.5 bg-brand-500 mt-1 w-full" />
        </div>
        {subtitle && (
          <p className="text-sm text-white/50 mt-1 font-medium tracking-widest uppercase">
            {subtitle}
          </p>
        )}
      </div>
    </header>
  );
}
