import { createClient } from "@/lib/supabase/client";

interface PdfSummary {
  summary_type: "book" | "chapter" | "subchapter";
  toc_title: string;
  chapter_path: string;
  start_position: string | null;
  end_position: string | null;
  summary_text: string | null;
}

interface PdfPosition {
  page: number;
  line: number;
  charOffset: number;
}

function parsePdfPosition(position: string | null | undefined): PdfPosition | null {
  if (!position) return null;
  const parts = position.split(/[/:]/).map((part) => parseInt(part, 10));
  if (parts.length < 3 || parts.some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    page: parts[0],
    line: parts[1],
    charOffset: parts[2],
  };
}

function comparePdfPositions(a: PdfPosition, b: PdfPosition): number {
  if (a.page !== b.page) return a.page - b.page;
  if (a.line !== b.line) return a.line - b.line;
  return a.charOffset - b.charOffset;
}

function positionsIntersect(
  selectionStart: string,
  selectionEnd: string,
  summaryStart: string | null,
  summaryEnd: string | null
): boolean {
  const selStart = parsePdfPosition(selectionStart);
  const selEnd = parsePdfPosition(selectionEnd);
  const sumStart = parsePdfPosition(summaryStart);
  const sumEnd = summaryEnd ? parsePdfPosition(summaryEnd) : null;

  if (!selStart || !selEnd || !sumStart) {
    return false;
  }

  const startsBeforeEnd = sumEnd ? comparePdfPositions(selStart, sumEnd) <= 0 : true;
  const endsAfterStart = comparePdfPositions(selEnd, sumStart) >= 0;

  return startsBeforeEnd && endsAfterStart;
}

export async function queryPdfSummariesForPosition(
  bookId: string,
  startPosition: string,
  endPosition: string
): Promise<PdfSummary[]> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("summaries")
      .select(
        "summary_type, toc_title, chapter_path, start_position, end_position, summary_text"
      )
      .eq("book_id", bookId);

    if (error) {
      console.error("Error querying PDF summaries:", error);
      return [];
    }

    if (!data || data.length === 0) {
      console.log("No summaries found for this PDF");
      return [];
    }

    const matchingSummaries = data.filter((summary) => {
      if (summary.summary_type === "book") {
        return true;
      }
      return positionsIntersect(
        startPosition,
        endPosition,
        summary.start_position,
        summary.end_position
      );
    });

    matchingSummaries.sort((a, b) => {
      if (a.summary_type === "book" && b.summary_type !== "book") return -1;
      if (a.summary_type !== "book" && b.summary_type === "book") return 1;
      return (a.chapter_path || "").localeCompare(b.chapter_path || "");
    });

    return matchingSummaries;
  } catch (error) {
    console.error("Error in queryPdfSummariesForPosition:", error);
    return [];
  }
}
