"use client";

import Link from "next/link";
import { BookOpen, User } from "lucide-react";
import { hapticLight } from "@/lib/haptic";

interface BookCardProps {
  id: string;
  title: string;
  authorDisplay: string;
  coverUrl: string | null;
}

export function BookCard({ id, title, authorDisplay, coverUrl }: BookCardProps) {
  return (
    <Link
      href={`/read/${id}`}
      onClick={() => hapticLight()}
      className="group flex flex-col rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
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
    </Link>
  );
}
