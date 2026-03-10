import { MinervaLogo } from "@/components/minerva-logo";

export default function LoadingReadBookPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <MinervaLogo size={48} className="animate-pulse" />
        <div className="text-sm text-muted-foreground">Loading book…</div>
      </div>
    </div>
  );
}

