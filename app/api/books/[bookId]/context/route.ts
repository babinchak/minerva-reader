import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export interface ContextSummary {
  summary_type: "book" | "chapter" | "subchapter";
  toc_title: string;
  chapter_path: string;
  start_position: string | null;
  end_position: string | null;
  summary_text: string | null;
}

function parsePdfPosition(position: string | null | undefined): { page: number; line: number; charOffset: number } | null {
  if (!position) return null;
  const parts = position.split(/[/:]/).map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((v) => Number.isNaN(v))) return null;
  return { page: parts[0], line: parts[1], charOffset: parts[2] };
}

function comparePdfPositions(a: string | null, b: string | null): number {
  const pa = parsePdfPosition(a);
  const pb = parsePdfPosition(b);
  if (!pa || !pb) return (a || "").localeCompare(b || "");
  if (pa.page !== pb.page) return pa.page - pb.page;
  if (pa.line !== pb.line) return pa.line - pb.line;
  return pa.charOffset - pb.charOffset;
}

function pdfPositionsIntersect(
  selStart: string,
  selEnd: string,
  sumStart: string | null,
  sumEnd: string | null
): boolean {
  const s1 = parsePdfPosition(selStart);
  const s2 = parsePdfPosition(selEnd);
  const m1 = parsePdfPosition(sumStart);
  const m2 = sumEnd ? parsePdfPosition(sumEnd) : null;
  if (!s1 || !s2 || !m1) return false;
  const beforeEnd = !m2 || comparePdfPositions(selStart, sumEnd) <= 0;
  const afterStart = comparePdfPositions(selEnd, sumStart) >= 0;
  return beforeEnd && afterStart;
}

function epubPositionsIntersect(
  selStart: string,
  selEnd: string,
  sumStart: string,
  sumEnd: string | null,
  sumStartRO: number,
  sumEndRO: number
): boolean {
  const getRO = (pos: string) => {
    const p = pos.split("/")[0];
    const n = parseInt(p, 10);
    return isNaN(n) ? null : n;
  };
  const getPath = (pos: string) => {
    const parts = pos.split("/").slice(1, -1);
    const nums = parts.map((p) => parseInt(p, 10)).filter((n) => !isNaN(n));
    return nums.length > 0 ? nums : null;
  };
  const cmp = (ro1: number, path1: number[] | null, ro2: number, path2: number[] | null) => {
    if (ro1 < ro2) return -1;
    if (ro1 > ro2) return 1;
    if (!path1 && !path2) return 0;
    if (!path1) return -1;
    if (!path2) return 1;
    const len = Math.min(path1.length, path2.length);
    for (let i = 0; i < len; i++) {
      if (path1[i]! < path2[i]!) return -1;
      if (path1[i]! > path2[i]!) return 1;
    }
    return path1.length - path2.length;
  };
  const selRO = getRO(selStart);
  const selPath = getPath(selStart);
  const endRO = getRO(selEnd);
  const endPath = getPath(selEnd);
  const sumPath = getPath(sumStart);
  const sumEPath = sumEnd ? getPath(sumEnd) : null;
  if (selRO === null || selPath === null || endRO === null || endPath === null || sumPath === null) return false;
  const beforeEnd = sumEPath === null
    ? selRO <= sumEndRO
    : cmp(selRO, selPath, sumEndRO, sumEPath) <= 0;
  const afterStart = cmp(endRO, endPath, sumStartRO, sumPath) >= 0;
  return beforeEnd && afterStart;
}

/** Sort: book first, then chapter (wide) then subchapter (narrow), each by start_position */
function sortSummariesForDisplay(summaries: ContextSummary[]): ContextSummary[] {
  const book = summaries.filter((s) => s.summary_type === "book");
  const chapter = summaries.filter((s) => s.summary_type === "chapter");
  const subchapter = summaries.filter((s) => s.summary_type === "subchapter");
  chapter.sort((a, b) => comparePdfPositions(a.start_position, b.start_position));
  subchapter.sort((a, b) => comparePdfPositions(a.start_position, b.start_position));
  return [...book, ...chapter, ...subchapter];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { bookType, startPosition, endPosition } = body as {
      bookType?: "pdf" | "epub";
      startPosition?: string;
      endPosition?: string;
    };

    if (!bookType || !startPosition || !endPosition) {
      return NextResponse.json(
        { error: "bookType, startPosition, and endPosition are required" },
        { status: 400 }
      );
    }

    let summaries: ContextSummary[] = [];

    if (bookType === "pdf") {
      const { data, error } = await supabase
        .from("summaries")
        .select("summary_type, toc_title, chapter_path, start_position, end_position, summary_text")
        .eq("book_id", bookId);
      if (error || !data) {
        return NextResponse.json({ book: null, summaries: [] });
      }
      const matching = data.filter((s) => {
        if (s.summary_type === "book") return true;
        return pdfPositionsIntersect(startPosition, endPosition, s.start_position, s.end_position);
      });
      summaries = matching.map((s) => ({
        summary_type: s.summary_type as "book" | "chapter" | "subchapter",
        toc_title: s.toc_title,
        chapter_path: s.chapter_path,
        start_position: s.start_position,
        end_position: s.end_position,
        summary_text: s.summary_text,
      }));
    } else {
      const readingOrderIndex = parseInt(startPosition.split("/")[0], 10);
      if (isNaN(readingOrderIndex)) {
        return NextResponse.json({ book: null, summaries: [] });
      }
      const { data, error } = await supabase
        .from("summaries")
        .select("summary_type, toc_title, chapter_path, start_position, end_position, start_reading_order, end_reading_order, summary_text")
        .eq("book_id", bookId)
        .gte("end_reading_order", readingOrderIndex)
        .lte("start_reading_order", readingOrderIndex);
      if (error || !data) {
        return NextResponse.json({ book: null, summaries: [] });
      }
      const matching = data.filter((s) =>
        epubPositionsIntersect(
          startPosition,
          endPosition,
          s.start_position,
          s.end_position,
          s.start_reading_order,
          s.end_reading_order
        )
      );
      summaries = matching.map((s) => ({
        summary_type: (s.summary_type as "book" | "chapter" | "subchapter") || "chapter",
        toc_title: s.toc_title,
        chapter_path: s.chapter_path,
        start_position: s.start_position,
        end_position: s.end_position,
        summary_text: s.summary_text,
      }));
    }

    const sorted = sortSummariesForDisplay(summaries);

    const { data: book } = await supabase
      .from("books")
      .select("title, author")
      .eq("id", bookId)
      .single();

    return NextResponse.json({
      book: book ? { title: book.title, author: book.author } : null,
      summaries: sorted,
    });
  } catch (err) {
    console.error("Context API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch context" },
      { status: 500 }
    );
  }
}
