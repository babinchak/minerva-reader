"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface BookSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function BookSearchInput({ value, onChange, className }: BookSearchInputProps) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Search by title or author…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 pl-8 pr-8 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
