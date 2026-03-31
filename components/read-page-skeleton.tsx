import { MinervaLogo } from "@/components/minerva-logo";

export function ReadPageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <MinervaLogo size={48} variant="large" />
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
    </div>
  );
}
