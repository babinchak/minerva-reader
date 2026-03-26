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

/** Parse a PDF position string. Supports both new page-only format ("5") and legacy "5/12/0". */
function parsePdfPage(position: string | null | undefined): number | null {
  if (!position) return null;
  const page = parseInt(position.split("/")[0], 10);
  return Number.isNaN(page) ? null : page;
}

function comparePdfPositions(a: string | null, b: string | null): number {
  const pa = parsePdfPage(a);
  const pb = parsePdfPage(b);
  if (pa == null || pb == null) return (a || "").localeCompare(b || "");
  return pa - pb;
}

function pdfPositionsIntersect(
  selStart: string,
  selEnd: string,
  sumStart: string | null,
  sumEnd: string | null
): boolean {
  const selStartPage = parsePdfPage(selStart);
  const selEndPage = parsePdfPage(selEnd);
  const sumStartPage = parsePdfPage(sumStart);
  const sumEndPage = parsePdfPage(sumEnd) ?? sumStartPage;
  if (selStartPage == null || selEndPage == null || sumStartPage == null) return false;
  // Page ranges intersect if neither is entirely before the other
  return selStartPage <= (sumEndPage ?? sumStartPage) && selEndPage >= sumStartPage;
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

    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const { bookType, startPosition, endPosition } = body as {
      bookType?: "pdf" | "epub";
      startPosition?: string;
      endPosition?: string;
    };

    // Anonymous: only allow context for curated books
    if (!user) {
      const { data: book } = await supabase
        .from("books")
        .select("is_curated")
        .eq("id", bookId)
        .single();
      if (!book?.is_curated) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      // Logged-in: verify access via user_books
      const { data: userBook } = await supabase
        .from("user_books")
        .select("id")
        .eq("user_id", user.id)
        .eq("book_id", bookId)
        .single();
      const { data: curatedBook } = await supabase
        .from("books")
        .select("is_curated")
        .eq("id", bookId)
        .single();
      if (!userBook && !curatedBook?.is_curated) {
        return NextResponse.json({ error: "Access denied to this book" }, { status: 403 });
      }
    }

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
      // Fetch all summaries (like PDF) so book-level always included; filter in memory
      const { data, error } = await supabase
        .from("summaries")
        .select("summary_type, toc_title, chapter_path, start_position, end_position, start_reading_order, end_reading_order, summary_text")
        .eq("book_id", bookId);
      if (error || !data) {
        return NextResponse.json({ book: null, summaries: [] });
      }
      const matching = data.filter((s) => {
        if (s.summary_type === "book") return true;
        if (
          s.start_reading_order == null ||
          s.end_reading_order == null ||
          s.start_position == null
        ) {
          return false;
        }
        return epubPositionsIntersect(
          startPosition,
          endPosition,
          s.start_position,
          s.end_position,
          s.start_reading_order,
          s.end_reading_order
        );
      });
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
