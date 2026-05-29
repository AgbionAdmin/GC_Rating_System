export default function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <div className="w-8 h-8 border-2 border-white/20 border-t-brand-500 rounded-full animate-spin" />
      <p className="text-white/50 text-sm">{message}</p>
    </div>
  );
}
