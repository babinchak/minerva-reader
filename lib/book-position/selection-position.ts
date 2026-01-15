import { SelectionPosition } from "@/lib/book-position/types";
import { getTextSelection } from "@/lib/book-position/selection";
import { resolveReadingOrderIndexFromStore } from "@/lib/book-position/reading-order";
import { calculateSelectionPositions } from "@/lib/book-position/positions";

// Get current selection position
export function getCurrentSelectionPosition(
  readingOrder: Array<{ href?: string }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: { getState: () => any } | null
): SelectionPosition | null {
  const selectionResult = getTextSelection();
  if (!selectionResult) {
    return null;
  }

  const { range, targetDoc } = selectionResult;

  // Try to get readingOrder index from Redux store or iframe inspection
  const readingOrderIndexFromStore = resolveReadingOrderIndexFromStore(readingOrder, store);

  // Calculate positions
  if (!range) {
    return null;
  }
  const positions = calculateSelectionPositions(range, readingOrder, targetDoc, readingOrderIndexFromStore);
  return positions;
}
