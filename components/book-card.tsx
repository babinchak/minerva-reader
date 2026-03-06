"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpen, MoreVertical, Trash2, User } from "lucide-react";
import { hapticLight } from "@/lib/haptic";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BookCardProps {
  id: string;
  title: string;
  authorDisplay: string;
  coverUrl: string | null;
}

export function BookCard({ id, title, authorDisplay, coverUrl }: BookCardProps) {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/books/${id}/library`, { method: "DELETE" });
      if (res.ok) {
        hapticLight();
        router.refresh();
      }
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div
      className={`group flex flex-col rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50 transition-opacity ${
        isRemoving ? "pointer-events-none opacity-0" : ""
      }`}
    >
      <a
        href={`/read/${id}`}
        onClick={() => hapticLight()}
        className="flex flex-col"
      >
        <div className="mb-3 aspect-[2/3] w-full overflow-hidden rounded-md bg-muted shadow-sm">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={`Cover of ${title}`}
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <BookOpen className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
        </div>
        <h3 className="line-clamp-2 font-medium text-foreground group-hover:text-primary">
          {title}
        </h3>
        {authorDisplay && (
          <p className="mt-0.5 line-clamp-1 flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{authorDisplay}</span>
          </p>
        )}
      </a>
      <div className="mt-2 flex h-9 items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 -mr-1"
              aria-label="Book options"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={handleRemove}
              disabled={isRemoving}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              {isRemoving ? "Removing…" : "Remove from library"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
