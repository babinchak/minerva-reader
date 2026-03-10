import Link from "next/link";
import { cn } from "@/lib/utils";
import { MinervaLogo } from "@/components/minerva-logo";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "w-full flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border py-8 text-xs text-muted-foreground",
        className
      )}
    >
      <Link href="/" className="flex items-center gap-2 font-medium text-foreground hover:text-foreground/90">
        <MinervaLogo size={20} />
        Minerva Reader
      </Link>
      <Link
        href="/privacy"
        className="hover:text-foreground underline-offset-4 hover:underline"
      >
        Privacy Policy
      </Link>
      <Link
        href="/terms"
        className="hover:text-foreground underline-offset-4 hover:underline"
      >
        Terms of Service
      </Link>
    </footer>
  );
}
