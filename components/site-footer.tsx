import Link from "next/link";
import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "w-full flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border py-8 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="font-medium text-foreground">Minerva Reader</span>
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
