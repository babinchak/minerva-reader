import Link from "next/link";
import { BookOpen } from "lucide-react";

export interface CollectionCardProps {
  name: string;
  description: string | null;
  slug: string;
  coverUrl: string | null;
  bookCount: number;
}

export function CollectionCard({
  name,
  description,
  slug,
  coverUrl,
  bookCount,
}: CollectionCardProps) {
  return (
    <Link
      href={`/browse/${slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[16/9] bg-muted">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60">
            <BookOpen className="h-10 w-10 text-muted-foreground/50" />
          </div>
        )}
        <span className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
          {bookCount} book{bookCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex flex-col gap-1 p-4">
        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
          {name}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
        )}
      </div>
    </Link>
  );
}
