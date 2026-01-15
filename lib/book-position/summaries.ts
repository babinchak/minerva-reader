import { createClient } from "@/lib/supabase/client";
import { Summary } from "@/lib/book-position/types";

// Helper function to check if two position ranges intersect
function positionsIntersect(
  selectionStart: string,
  selectionEnd: string,
  summaryStart: string,
  summaryEnd: string | null,
  summaryStartReadingOrder: number,
  summaryEndReadingOrder: number
): boolean {
  // Extract reading_order_index from selection (first number)
  const getReadingOrderIndex = (pos: string): number | null => {
    const parts = pos.split("/");
    if (parts.length < 1) return null;
    const index = parseInt(parts[0], 10);
    return isNaN(index) ? null : index;
  };

  // Extract element path from selection (drop reading_order_index and char_offset)
  const getSelectionElementPath = (pos: string): number[] | null => {
    const parts = pos.split("/");
    if (parts.length < 3) return null; // Need at least reading_order_index/element_path/char_offset
    // Skip first part (reading_order_index) and last part (char_offset)
    const elementParts = parts.slice(1, -1);
    const numericParts = elementParts.map((p) => {
      const num = parseInt(p, 10);
      return isNaN(num) ? null : num;
    });
    const validParts = numericParts.filter((p) => p !== null) as number[];
    return validParts.length > 0 ? validParts : null;
  };

  // Parse summary element path (it's just the element path, e.g., "3" or "49")
  const getSummaryElementPath = (pos: string | null): number[] | null => {
    if (!pos) return null;
    const parts = pos.split("/");
    const numericParts = parts.map((p) => {
      const num = parseInt(p, 10);
      return isNaN(num) ? null : num;
    });
    const validParts = numericParts.filter((p) => p !== null) as number[];
    return validParts.length > 0 ? validParts : null;
  };

  // Compare positions: format is {reading_order}/{element_path}
  const comparePositions = (
    readingOrder1: number,
    path1: number[] | null,
    readingOrder2: number,
    path2: number[] | null
  ): number => {
    // First compare reading orders
    if (readingOrder1 < readingOrder2) return -1;
    if (readingOrder1 > readingOrder2) return 1;

    // If reading orders are equal, compare paths
    if (path1 === null && path2 === null) return 0;
    if (path1 === null) return -1; // null path comes before non-null
    if (path2 === null) return 1;

    const minLength = Math.min(path1.length, path2.length);
    for (let i = 0; i < minLength; i++) {
      if (path1[i] < path2[i]) return -1;
      if (path1[i] > path2[i]) return 1;
    }
    // If one is a prefix of the other, the shorter one comes first
    if (path1.length < path2.length) return -1;
    if (path1.length > path2.length) return 1;
    return 0;
  };

  const selStartReadingOrder = getReadingOrderIndex(selectionStart);
  const selEndReadingOrder = getReadingOrderIndex(selectionEnd);
  const selStartPath = getSelectionElementPath(selectionStart);
  const selEndPath = getSelectionElementPath(selectionEnd);
  const sumStartPath = getSummaryElementPath(summaryStart);
  const sumEndPath = getSummaryElementPath(summaryEnd);

  if (selStartReadingOrder === null || selEndReadingOrder === null || selStartPath === null || selEndPath === null || sumStartPath === null) {
    return false;
  }

  // Check if selection start is before or at summary end
  const summaryEndPathForComparison = sumEndPath === null
    ? null // null means end of file - we'll handle this specially
    : sumEndPath;

  // Selection starts before or at summary end
  const startsBeforeEnd = summaryEndPathForComparison === null
    ? selStartReadingOrder <= summaryEndReadingOrder
    : comparePositions(selStartReadingOrder, selStartPath, summaryEndReadingOrder, summaryEndPathForComparison) <= 0;

  // Selection ends after or at summary start
  const endsAfterStart = comparePositions(selEndReadingOrder, selEndPath, summaryStartReadingOrder, sumStartPath) >= 0;

  return startsBeforeEnd && endsAfterStart;
}

// Query summaries for a selection position
export async function querySummariesForPosition(
  bookId: string,
  startPosition: string,
  endPosition: string
): Promise<Summary[]> {
  const supabase = createClient();

  try {
    // Extract reading_order_index from start position (first number before "/")
    const readingOrderIndex = parseInt(startPosition.split("/")[0], 10);

    if (isNaN(readingOrderIndex)) {
      console.error("Could not extract reading_order_index from position:", startPosition);
      return [];
    }

    // Query summaries where the current reading order falls between start_reading_order and end_reading_order
    // Note: Summaries can span multiple reading order items
    const { data, error } = await supabase
      .from("summaries")
      .select("toc_title, chapter_path, start_position, end_position, start_reading_order, end_reading_order, summary_text")
      .eq("book_id", bookId)
      .gte("end_reading_order", readingOrderIndex)
      .lte("start_reading_order", readingOrderIndex);

    if (error) {
      console.error("Error querying summaries:", error);
      return [];
    }

    if (!data || data.length === 0) {
      console.log("No summaries found for this book");
      return [];
    }

    // Filter summaries where selection intersects with start_position and end_position
    // Positions are in format: {start_reading_order}/{start_position} and {end_reading_order}/{end_position}
    const matchingSummaries = data.filter((summary) => {
      return positionsIntersect(
        startPosition,
        endPosition,
        summary.start_position,
        summary.end_position,
        summary.start_reading_order,
        summary.end_reading_order
      );
    });

    // Sort by chapter_path
    matchingSummaries.sort((a, b) => {
      return (a.chapter_path || "").localeCompare(b.chapter_path || "");
    });

    return matchingSummaries;
  } catch (error) {
    console.error("Error in querySummariesForPosition:", error);
    return [];
  }
}
