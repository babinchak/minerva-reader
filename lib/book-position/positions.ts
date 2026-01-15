import { SelectionPosition } from "@/lib/book-position/types";

// Export calculatePositions for use in other files
export function calculateSelectionPositions(
  range: Range,
  readingOrder: Array<{ href?: string }>,
  targetDoc: Document,
  readingOrderIndexFromStore: number = -1
): SelectionPosition {
  return calculatePositions(range, readingOrder, targetDoc, readingOrderIndexFromStore);
}

function calculatePositions(
  range: Range,
  readingOrder: Array<{ href?: string }>,
  targetDoc: Document,
  readingOrderIndexFromStore: number = -1
): SelectionPosition {
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

function calculateViewPositions(
  targetDoc: Document,
  readingOrder: Array<{ href?: string }>,
  readingOrderIndex: number
): { viewStart: string; viewEnd: string } {
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

function findFirstVisibleTextNode(
  doc: Document,
  viewportTop: number,
  viewportBottom: number
): { node: Node; offset: number } | null {
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

function findLastVisibleTextNode(
  doc: Document,
  viewportTop: number,
  viewportBottom: number
): { node: Node; offset: number } | null {
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
