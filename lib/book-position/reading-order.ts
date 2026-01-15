export function resolveReadingOrderIndexFromStore(
  readingOrder: Array<{ href?: string }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: { getState: () => any } | null
): number {
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
          if (!obj || typeof obj !== "object") return null;

          // Check for common link property names
          if (obj.href || obj.link || obj.currentLink) {
            return obj.href || obj.link || obj.currentLink;
          }

          // Check for index
          if (typeof obj.index === "number" && obj.index >= 0) {
            currentIndex = obj.index;
          }

          // Recursively search
          for (const key in obj) {
            if (key.toLowerCase().includes("link") || key.toLowerCase().includes("href") ||
                key.toLowerCase().includes("location") || key.toLowerCase().includes("current")) {
              const result = deepSearch(obj[key], depth + 1);
              if (result) return result;
            }
          }
          return null;
        };

        currentLink = deepSearch(readerState) || deepSearch(publicationState);
      }

      if (typeof currentIndex === "number" && currentIndex >= 0 && currentIndex < readingOrder.length) {
        readingOrderIndexFromStore = currentIndex;
      } else if (currentLink) {
        // Find index by matching the current link
        const linkHref = typeof currentLink === "string" ? currentLink : (currentLink.href || currentLink);

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

  return readingOrderIndexFromStore;
}
