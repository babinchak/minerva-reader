import { createClient } from "@/lib/supabase/client";

interface PdfSummary {
  summary_type: "book" | "chapter" | "subchapter";
  toc_title: string;
  chapter_path: string;
  start_position: string | null;
  end_position: string | null;
  summary_text: string | null;
}

/** Parse the page number from a position string. Supports both "5" and legacy "5/12/0". */
function parsePdfPage(position: string | null | undefined): number | null {
  if (!position) return null;
  const page = parseInt(position.split("/")[0], 10);
  return Number.isNaN(page) ? null : page;
}

function positionsIntersect(
  selectionStart: string,
  selectionEnd: string,
  summaryStart: string | null,
  summaryEnd: string | null
): boolean {
  const selStartPage = parsePdfPage(selectionStart);
  const selEndPage = parsePdfPage(selectionEnd);
  const sumStartPage = parsePdfPage(summaryStart);
  const sumEndPage = parsePdfPage(summaryEnd) ?? sumStartPage;

  if (selStartPage == null || selEndPage == null || sumStartPage == null) return false;

  return selStartPage <= (sumEndPage ?? sumStartPage) && selEndPage >= sumStartPage;
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
