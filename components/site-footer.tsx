"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { MinervaLogo } from "@/components/minerva-logo";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function SiteFooter({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
      <FeedbackDialog>
        <button className="hover:text-foreground underline-offset-4 hover:underline">
          Feedback
        </button>
      </FeedbackDialog>
      <span className="text-muted-foreground/70">
        Thanks to{" "}
        <a href="https://www.gutenberg.org" target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline-offset-4 hover:underline">Project Gutenberg</a>
        {" & "}
        <a href="https://readium.org" target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline-offset-4 hover:underline">Readium Foundation</a>
      </span>
      {mounted && (
        <div className="flex rounded-lg border border-border p-0.5">
          {([
            { value: "light", icon: Sun },
            { value: "dark", icon: Moon },
            { value: "system", icon: Laptop },
          ] as const).map(({ value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                theme === value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}
    </footer>
  );
}
