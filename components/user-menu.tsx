"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, LogOut, Sun, Moon, Laptop } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

function emailToColor(email: string) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash >> 0) & 0xff) * 1.41;
  return `hsl(${hue}, 55%, 45%)`;
}

export function UserMenu({
  email,
  displayName,
  avatarUrl,
}: {
  email: string;
  displayName: string;
  avatarUrl?: string;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="flex w-fit items-center gap-2 rounded-md px-2 py-1 hover:bg-accent transition-colors outline-none">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="size-7 shrink-0 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium"
            style={{ backgroundColor: emailToColor(email), color: "#fff" }}
          >
            {email[0].toUpperCase()}
          </div>
        )}
        <span className="text-sm text-muted-foreground">{displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
        {mounted && (
          <>
            <DropdownMenuSeparator />
            <div className="flex justify-center py-1.5">
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
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
