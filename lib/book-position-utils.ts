import { createClient } from "@/lib/supabase/client";

// Utility function to get text selection from main document or iframe
export function getTextSelection(): { selection: Selection | null; range: Range | null; targetDoc: Document } | null {
  // Try to get selection from the main document first
  let selection: Selection | null = window.getSelection();
  let range: Range | null = null;
  let targetDoc: Document = document;
  
  // Check if selection is valid in main document
  if (selection && selection.rangeCount > 0 && selection.toString().trim() !== "") {
    range = selection.getRangeAt(0);
    return { selection, range, targetDoc };
  }
  
  // Look for iframe that might contain the reader content
  const iframes = document.querySelectorAll("iframe");
  for (const iframe of iframes) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        const iframeSelection = iframeDoc.getSelection();
        if (iframeSelection && iframeSelection.rangeCount > 0 && iframeSelection.toString().trim() !== "") {
          selection = iframeSelection;
          range = iframeSelection.getRangeAt(0);
          targetDoc = iframeDoc;
          return { selection, range, targetDoc };
        }
      }
        } catch {
          // Cross-origin iframe, skip
          continue;
        }
  }
  
  return null;
}

// Utility function to get selected text from main document or iframe
export function getSelectedText(): string {
  const result = getTextSelection();
  return result?.selection?.toString().trim() || "";
}

export interface SelectionPosition {
  start: string;
  end: string;
  viewStart: string;
  viewEnd: string;
}

export interface Summary {
  toc_title: string;
  chapter_path: string;
  start_position: string;
  end_position: string | null;
  start_reading_order: number;
  end_reading_order: number;
  summary_text: string | null;
}

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
    const numericParts = elementParts.map(p => {
      const num = parseInt(p, 10);
      return isNaN(num) ? null : num;
    });
    const validParts = numericParts.filter(p => p !== null) as number[];
    return validParts.length > 0 ? validParts : null;
  };

  // Parse summary element path (it's just the element path, e.g., "3" or "49")
  const getSummaryElementPath = (pos: string | null): number[] | null => {
    if (!pos) return null;
    const parts = pos.split("/");
    const numericParts = parts.map(p => {
      const num = parseInt(p, 10);
      return isNaN(num) ? null : num;
    });
    const validParts = numericParts.filter(p => p !== null) as number[];
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

  // Try to get readingOrder index from Redux store
  let readingOrderIndexFromStore = -1;
  try {
    if (store) {
      const state = store.getState();
      
      // Deep inspect the state to find current link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const readerState = (state as any).reader;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const publicationState = (state as any).publication;
      
      // Try to find current link in various places
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let currentLink: any = null;
      let currentIndex: number = -1;
      
      // Check reader state
      if (readerState) {
        currentLink = readerState.currentLink || readerState.link || readerState.href || 
                     readerState.location?.href || readerState.location?.link ||
                     readerState.navigator?.currentLink || readerState.navigator?.link;
        currentIndex = readerState.readingOrderIndex ?? readerState.index ?? 
                      readerState.location?.index ?? readerState.navigator?.index ?? -1;
      }
      
      // Check publication state
      if (!currentLink && publicationState) {
        currentLink = publicationState.currentLink || publicationState.link || 
                      publicationState.href || publicationState.location?.href ||
                      publicationState.navigator?.currentLink || publicationState.navigator?.link ||
                      publicationState.readingOrder?.[publicationState.currentIndex]?.href;
        currentIndex = publicationState.readingOrderIndex ?? publicationState.index ??
                      publicationState.location?.index ?? publicationState.navigator?.index ??
                      publicationState.currentIndex ?? -1;
      }
      
      // Check if there's a navigator state
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const navigatorState = (state as any).navigator;
      if (!currentLink && navigatorState) {
        currentLink = navigatorState.currentLink || navigatorState.link || navigatorState.href;
        currentIndex = navigatorState.index ?? navigatorState.readingOrderIndex ?? -1;
      }
      
      // Deep search in state for any link-related properties
      if (!currentLink) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const deepSearch = (obj: any, depth = 0): any => {
          if (depth > 3) return null; // Limit depth
          if (!obj || typeof obj !== 'object') return null;
          
          // Check for common link property names
          if (obj.href || obj.link || obj.currentLink) {
            return obj.href || obj.link || obj.currentLink;
          }
          
          // Check for index
          if (typeof obj.index === 'number' && obj.index >= 0) {
            currentIndex = obj.index;
          }
          
          // Recursively search
          for (const key in obj) {
            if (key.toLowerCase().includes('link') || key.toLowerCase().includes('href') || 
                key.toLowerCase().includes('location') || key.toLowerCase().includes('current')) {
              const result = deepSearch(obj[key], depth + 1);
              if (result) return result;
            }
          }
          return null;
        };
        
        currentLink = deepSearch(readerState) || deepSearch(publicationState);
      }
      
      if (typeof currentIndex === 'number' && currentIndex >= 0 && currentIndex < readingOrder.length) {
        readingOrderIndexFromStore = currentIndex;
      } else if (currentLink) {
        // Find index by matching the current link
        const linkHref = typeof currentLink === 'string' ? currentLink : (currentLink.href || currentLink);
        
        for (let i = 0; i < readingOrder.length; i++) {
          const itemHref = readingOrder[i].href || "";
          // Try various matching strategies
          if (
            itemHref === linkHref ||
            itemHref.endsWith(linkHref) ||
            linkHref.endsWith(itemHref) ||
            itemHref.includes(linkHref) ||
            linkHref.includes(itemHref) ||
            // Match by filename
            itemHref.split("/").pop() === linkHref.split("/").pop() ||
            itemHref.split("/").pop() === linkHref
          ) {
            readingOrderIndexFromStore = i;
            break;
          }
        }
      }
    }
    } catch {
      // Could not access Redux store
    }

  // If still couldn't find from store, try to match by inspecting the iframe document
  if (readingOrderIndexFromStore === -1) {
    try {
      // Try to find the iframe and check its document
      const iframes = document.querySelectorAll("iframe");
      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc && iframeDoc !== document) {
            // Check if there are any script tags or data attributes that might indicate the current link
            const metaTags = iframeDoc.querySelectorAll("meta");
            for (const meta of metaTags) {
              const content = meta.getAttribute("content");
              if (content) {
                for (let i = 0; i < readingOrder.length; i++) {
                  const itemHref = readingOrder[i]?.href;
                  if (itemHref && (content.includes(itemHref) || itemHref.includes(content))) {
                    readingOrderIndexFromStore = i;
                    break;
                  }
                }
                if (readingOrderIndexFromStore !== -1) break;
              }
            }
            
            // Check base tag
            const baseTag = iframeDoc.querySelector("base");
            if (baseTag && baseTag.href) {
              for (let i = 0; i < readingOrder.length; i++) {
                const itemHref = readingOrder[i]?.href;
                if (itemHref && (itemHref.includes(baseTag.href) || baseTag.href.includes(itemHref))) {
                  readingOrderIndexFromStore = i;
                  break;
                }
              }
            }
          }
        } catch {
          // Cross-origin, can't access
        }
      }
    } catch {
      // Error inspecting iframe
    }
  }

  // Calculate positions
  if (!range) {
    return null;
  }
  const positions = calculatePositions(range, readingOrder, targetDoc, readingOrderIndexFromStore);
  return positions;
}

// Export calculatePositions for use in other files
export function calculateSelectionPositions(
  range: Range,
  readingOrder: Array<{ href?: string }>,
  targetDoc: Document,
  readingOrderIndexFromStore: number = -1
): SelectionPosition {
  return calculatePositions(range, readingOrder, targetDoc, readingOrderIndexFromStore);
}

function calculatePositions(range: Range, readingOrder: Array<{ href?: string }>, targetDoc: Document, readingOrderIndexFromStore: number = -1): SelectionPosition {
  const startContainer = range.startContainer;
  const endContainer = range.endContainer;
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;

  // Use the provided targetDoc (which might be from an iframe)
  const startDoc = targetDoc;

  // Get the current document URL to find readingOrder index
  let currentUrl = "";
  
  // Try multiple ways to get the URL
  try {
    currentUrl = startDoc.URL || startDoc.defaultView?.location.href || "";
    } catch {
      // Can't access location
    }
  
  // Try baseURI as fallback
  if (!currentUrl) {
    try {
      currentUrl = startDoc.baseURI || "";
    } catch {
      // Can't access baseURI
    }
  }
  
  // Try document location
  if (!currentUrl && startDoc.defaultView) {
    try {
      currentUrl = startDoc.defaultView.location.href;
    } catch {
      // Cross-origin, can't access
    }
  }
  
  // Normalize URL: remove query params, fragments, and decode
  const normalizeUrl = (url: string): string => {
    try {
      // Remove query params and fragments
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      // If URL parsing fails, try manual cleanup
      return url.split("?")[0].split("#")[0];
    }
  };
  
  const normalizedCurrentUrl = normalizeUrl(currentUrl);
  
  // Use readingOrder index from store if available
  let readingOrderIndex = readingOrderIndexFromStore;
  
  // If not found in store, try to find by matching URL
  if (readingOrderIndex === -1) {
    // Extract filename from URL
    const urlParts = normalizedCurrentUrl.split("/");
    const currentFilename = urlParts[urlParts.length - 1] || "";
    
    for (let i = 0; i < readingOrder.length; i++) {
      const item = readingOrder[i];
      const itemHref = item.href || "";
      
      // Normalize the item href
      let normalizedItemHref = itemHref;
      try {
        // If itemHref is relative, we need to resolve it
        if (!itemHref.startsWith("http") && !itemHref.startsWith("/")) {
          // It's a relative path, use as-is
          normalizedItemHref = itemHref;
        } else {
          normalizedItemHref = normalizeUrl(itemHref);
        }
      } catch {
        // Keep original if normalization fails
        normalizedItemHref = itemHref;
      }
      
      // Extract filename from item href
      const itemParts = normalizedItemHref.split("/");
      const itemFilename = itemParts[itemParts.length - 1] || "";
      
      // Try multiple matching strategies
      const matches = 
        // Exact filename match
        currentFilename === itemFilename ||
        // URL contains item href or vice versa
        normalizedCurrentUrl.includes(normalizedItemHref) ||
        normalizedItemHref.includes(normalizedCurrentUrl) ||
        // Filename contains item filename or vice versa
        currentFilename.includes(itemFilename) ||
        itemFilename.includes(currentFilename) ||
        // Ends with match
        normalizedCurrentUrl.endsWith(normalizedItemHref) ||
        normalizedItemHref.endsWith(currentFilename) ||
        // Original URL matching (before normalization)
        currentUrl.includes(itemHref) ||
        itemHref.includes(currentUrl);
      
      if (matches) {
        readingOrderIndex = i;
        break;
      }
    }

    // If still not found, try to find by checking iframe src or other methods
    if (readingOrderIndex === -1) {
      // Look for iframe that might have the src
      const iframes = document.querySelectorAll("iframe");
      for (const iframe of iframes) {
        try {
          const iframeSrc = iframe.src || "";
          const normalizedIframeSrc = normalizeUrl(iframeSrc);
          const iframeFilename = normalizedIframeSrc.split("/").pop() || "";
          
          for (let i = 0; i < readingOrder.length; i++) {
            const item = readingOrder[i];
            const itemHref = item.href || "";
            const itemFilename = itemHref.split("/").pop() || "";
            
            if (
              normalizedIframeSrc.includes(itemHref) ||
              itemHref.includes(iframeFilename) ||
              iframeFilename === itemFilename ||
              iframeFilename.includes(itemFilename) ||
              itemFilename.includes(iframeFilename)
            ) {
              readingOrderIndex = i;
              break;
            }
          }
          if (readingOrderIndex !== -1) break;
        } catch {
          // Can't access iframe src
        }
      }
    }

    // If still not found, default to 0
    if (readingOrderIndex === -1) {
      readingOrderIndex = 0;
    }
  }

  // Calculate start position
  const startPath = getElementPath(startContainer, startOffset);
  const startPosition = `${readingOrderIndex}/${startPath}`;

  // Calculate end position
  const endPath = getElementPath(endContainer, endOffset);
  const endPosition = `${readingOrderIndex}/${endPath}`;

  // Calculate view start and end positions (visible text in viewport)
  const viewPositions = calculateViewPositions(targetDoc, readingOrder, readingOrderIndex);

  return {
    start: startPosition,
    end: endPosition,
    viewStart: viewPositions.viewStart,
    viewEnd: viewPositions.viewEnd,
  };
}

function getElementPath(container: Node, offset: number): string {
  // If container is a text node, get its parent element
  let element: Element | null = null;
  let charOffset = offset;
  const doc = container.ownerDocument || document;

  if (container.nodeType === Node.TEXT_NODE) {
    element = container.parentElement;
    // Calculate character offset from the start of the element
    // We need to count all text content before this text node within the element
    if (element) {
      charOffset = getTextOffsetBeforeNode(element, container as Text, doc) + offset;
    }
  } else if (container.nodeType === Node.ELEMENT_NODE) {
    element = container as Element;
    // For element nodes, offset refers to child index
    // We need to find the text node and calculate character offset
    if (element.childNodes[offset]) {
      const childNode = element.childNodes[offset];
      if (childNode.nodeType === Node.TEXT_NODE) {
        charOffset = getTextOffsetBeforeNode(element, childNode as Text, doc);
      } else {
        // Find first text node in this element
        const firstTextNode = getFirstTextNode(element);
        if (firstTextNode) {
          charOffset = getTextOffsetBeforeNode(element, firstTextNode, doc);
        } else {
          charOffset = 0;
        }
      }
    } else {
      // Offset is beyond children, use total text length
      charOffset = getElementTextLength(element, doc);
    }
  }

  if (!element) {
    return "unknown/0";
  }

  // Build path from body to element
  const path: string[] = [];
  let current: Element | null = element;
  const body = current.ownerDocument?.body;

  // Traverse up to body
  while (current && current !== body) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;

    // Get index of current element among ALL siblings (not filtered by tag name)
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(current);

    // Use just the index, not the tag name
    path.unshift(index.toString());
    current = parent;
  }

  // Don't add "body" - it's always implied since Readium always displays the body
  // If we didn't reach body, something went wrong, but still return the path we built

  const elementPath = path.join("/");
  return `${elementPath}/${charOffset}`;
}

function getTextOffsetBeforeNode(element: Element, targetNode: Text, doc: Document): number {
  let offset = 0;
  const walker = doc.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node;
  while ((node = walker.nextNode())) {
    if (node === targetNode) {
      break;
    }
    offset += node.textContent?.length || 0;
  }

  return offset;
}

function getElementTextLength(element: Element, doc: Document): number {
  let length = 0;
  const walker = doc.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node;
  while ((node = walker.nextNode())) {
    length += node.textContent?.length || 0;
  }

  return length;
}

function getFirstTextNode(element: Element): Text | null {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node as Text;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const textNode = getFirstTextNode(node as Element);
      if (textNode) return textNode;
    }
  }
  return null;
}

function calculateViewPositions(targetDoc: Document, readingOrder: Array<{ href?: string }>, readingOrderIndex: number): { viewStart: string; viewEnd: string } {
  const viewport = targetDoc.defaultView || window;
  
  // Get viewport height (getBoundingClientRect returns coordinates relative to viewport, not scroll position)
  let viewportHeight = 0;
  
  try {
    viewportHeight = viewport.innerHeight || targetDoc.documentElement.clientHeight || 0;
  } catch {
    // Fallback if we can't access viewport
    viewportHeight = targetDoc.documentElement.clientHeight || 0;
  }

  // Find the first visible text node (viewport-relative: top is 0, bottom is viewportHeight)
  const firstVisibleNode = findFirstVisibleTextNode(targetDoc, 0, viewportHeight);
  const viewStart = firstVisibleNode 
    ? `${readingOrderIndex}/${getElementPath(firstVisibleNode.node, firstVisibleNode.offset)}`
    : "unknown/0";

  // Find the last visible text node
  const lastVisibleNode = findLastVisibleTextNode(targetDoc, 0, viewportHeight);
  const viewEnd = lastVisibleNode
    ? `${readingOrderIndex}/${getElementPath(lastVisibleNode.node, lastVisibleNode.offset)}`
    : "unknown/0";

  return { viewStart, viewEnd };
}

function findFirstVisibleTextNode(doc: Document, viewportTop: number, viewportBottom: number): { node: Node; offset: number } | null {
  const body = doc.body || doc.documentElement;
  if (!body) return null;

  const walker = doc.createTreeWalker(
    body,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim().length > 0) {
      try {
        const range = doc.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        
        // Check if the text node is visible in the viewport
        // getBoundingClientRect returns coordinates relative to viewport (0 = top of viewport)
        if (rect.top < viewportBottom && rect.bottom > viewportTop && rect.height > 0) {
          const textNode = node as Text;
          const textContent = textNode.textContent || "";
          
          // If the top of the text node is above the viewport, find the offset
          let offset = 0;
          if (rect.top < viewportTop && rect.height > 0) {
            // Calculate approximate offset based on the portion of text above viewport
            const portionAboveViewport = Math.max(0, (viewportTop - rect.top) / rect.height);
            offset = Math.floor(textContent.length * portionAboveViewport);
            offset = Math.min(textContent.length, Math.max(0, offset));
          }
          
          return { node: textNode, offset };
        }
      } catch {
        // Skip if we can't get bounding rect
        continue;
      }
    }
  }

  return null;
}

function findLastVisibleTextNode(doc: Document, viewportTop: number, viewportBottom: number): { node: Node; offset: number } | null {
  const body = doc.body || doc.documentElement;
  if (!body) return null;

  const walker = doc.createTreeWalker(
    body,
    NodeFilter.SHOW_TEXT,
    null
  );

  let lastVisible: { node: Node; offset: number } | null = null;
  let node: Node | null;
  
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim().length > 0) {
      try {
        const range = doc.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        
        // Check if the text node is visible in the viewport
        // getBoundingClientRect returns coordinates relative to viewport (0 = top of viewport)
        if (rect.top < viewportBottom && rect.bottom > viewportTop && rect.height > 0) {
          const textNode = node as Text;
          const textContent = textNode.textContent || "";
          
          // If the bottom of the text node is below the viewport, find the offset
          let offset = textContent.length;
          if (rect.bottom > viewportBottom && rect.height > 0) {
            // Calculate approximate offset based on the portion of text visible
            const portionVisible = Math.max(0, (viewportBottom - rect.top) / rect.height);
            offset = Math.floor(textContent.length * portionVisible);
            offset = Math.min(textContent.length, Math.max(0, offset));
          }
          
          lastVisible = { node: textNode, offset };
        }
      } catch {
        // Skip if we can't get bounding rect
        continue;
      }
    }
  }

  return lastVisible;
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
