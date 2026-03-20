/**
 * Find match highlighting for PDF text layers.
 *
 * Derived from Mozilla pdf.js TextHighlighter (Apache-2.0).
 * pdfjs-dist does not export `TextHighlighter` from `web/pdf_viewer.mjs`, so we
 * keep a minimal copy here and subscribe via the public `EventBus.on` API.
 *
 * @see https://github.com/mozilla/pdf.js
 */

export type PdfFindEventBus = {
  on: (
    eventName: string,
    listener: (data: { pageIndex: number }) => void,
    options?: { signal?: AbortSignal; once?: boolean },
  ) => void;
  off?: (eventName: string, listener: (data: { pageIndex: number }) => void) => void;
};

export type PdfFindControllerForHighlight = {
  highlightMatches?: boolean;
  selected: { pageIdx: number; matchIdx: number };
  state: { highlightAll?: boolean } | null;
  pageMatches: (number[] | undefined)[];
  pageMatchesLength: (number[] | undefined)[];
  scrollMatchIntoView: (params: {
    element: HTMLElement;
    selectedLeft: number;
    pageIndex: number;
    matchIndex: number;
  }) => void;
};

/**
 * Mirrors pdf.js `TextHighlighter`: maps find results onto `TextLayer` divs.
 */
export class PdfFindTextHighlighter {
  findController: PdfFindControllerForHighlight;
  private readonly eventBus: PdfFindEventBus;
  private readonly pageIdx: number;
  private readonly onUpdateMatches: (evt: { pageIndex: number }) => void;
  private abort: AbortController | null = null;

  matches: Array<{
    begin: { divIdx: number; offset: number };
    end: { divIdx: number; offset: number };
  }> = [];
  textDivs: HTMLElement[] | null = null;
  textContentItemsStr: string[] | null = null;
  enabled = false;

  constructor(opts: {
    findController: PdfFindControllerForHighlight;
    eventBus: PdfFindEventBus;
    pageIndex: number;
  }) {
    this.findController = opts.findController;
    this.eventBus = opts.eventBus;
    this.pageIdx = opts.pageIndex;
    this.onUpdateMatches = (evt: { pageIndex: number }) => {
      if (evt.pageIndex === this.pageIdx || evt.pageIndex === -1) {
        this._updateMatches();
      }
    };
  }

  setTextMapping(divs: HTMLElement[], texts: string[]) {
    this.textDivs = divs;
    this.textContentItemsStr = texts;
  }

  enable() {
    if (!this.textDivs || !this.textContentItemsStr) {
      throw new Error("Text divs and strings have not been set.");
    }
    if (this.enabled) {
      throw new Error("PdfFindTextHighlighter is already enabled.");
    }
    this.enabled = true;
    this.abort = new AbortController();
    this.eventBus.on("updatetextlayermatches", this.onUpdateMatches, {
      signal: this.abort.signal,
    });
    this._updateMatches();
  }

  disable() {
    if (!this.enabled) {
      return;
    }
    this.enabled = false;
    this.abort?.abort();
    this.abort = null;
    this._updateMatches(true);
  }

  private _convertMatches(matches: number[] | null | undefined, matchesLength: number[] | null | undefined) {
    if (!matches || !matchesLength || !this.textContentItemsStr) {
      return [];
    }
    const textContentItemsStr = this.textContentItemsStr;
    let i = 0;
    let iIndex = 0;
    const end = textContentItemsStr.length - 1;
    const result: Array<{
      begin: { divIdx: number; offset: number };
      end: { divIdx: number; offset: number };
    }> = [];
    for (let m = 0, mm = matches.length; m < mm; m++) {
      let matchIdx = matches[m];
      while (i !== end && matchIdx >= iIndex + textContentItemsStr[i].length) {
        iIndex += textContentItemsStr[i].length;
        i++;
      }
      if (i === textContentItemsStr.length) {
        console.error("PdfFindTextHighlighter: could not map match to text div");
      }
      const match = {
        begin: {
          divIdx: i,
          offset: matchIdx - iIndex,
        },
      } as {
        begin: { divIdx: number; offset: number };
        end: { divIdx: number; offset: number };
      };
      matchIdx += matchesLength[m];
      while (i !== end && matchIdx > iIndex + textContentItemsStr[i].length) {
        iIndex += textContentItemsStr[i].length;
        i++;
      }
      match.end = {
        divIdx: i,
        offset: matchIdx - iIndex,
      };
      result.push(match);
    }
    return result;
  }

  private _renderMatches(
    matches: Array<{
      begin: { divIdx: number; offset: number };
      end: { divIdx: number; offset: number };
    }>,
  ) {
    if (matches.length === 0 || !this.textDivs || !this.textContentItemsStr) {
      return;
    }
    const { findController, pageIdx } = this;
    const { textContentItemsStr, textDivs } = this;
    const isSelectedPage = pageIdx === findController.selected.pageIdx;
    const selectedMatchIdx = findController.selected.matchIdx;
    const highlightAll = findController.state?.highlightAll !== false;
    let prevEnd: { divIdx: number; offset: number } | null = null;
    const infinity = { divIdx: -1, offset: undefined as number | undefined };

    const appendTextToDiv = (divIdx: number, fromOffset: number, toOffset: number | undefined, className?: string) => {
      let div = textDivs[divIdx];
      if (div.nodeType === Node.TEXT_NODE) {
        const span = document.createElement("span");
        div.before(span);
        span.append(div);
        textDivs[divIdx] = span;
        div = span;
      }
      const content = textContentItemsStr[divIdx].substring(fromOffset, toOffset);
      const node = document.createTextNode(content);
      if (className) {
        const span = document.createElement("span");
        span.className = `${className} appended`;
        span.append(node);
        div.append(span);
        if (className.includes("selected")) {
          const rects = span.getClientRects();
          if (rects.length > 0) {
            const left = rects[0].left;
            const parentLeft = div.getBoundingClientRect().left;
            return left - parentLeft;
          }
        }
        return 0;
      }
      div.append(node);
      return 0;
    };

    const beginText = (begin: { divIdx: number; offset: number }, className?: string) => {
      const divIdx = begin.divIdx;
      textDivs[divIdx].textContent = "";
      return appendTextToDiv(divIdx, 0, begin.offset, className);
    };

    let i0 = selectedMatchIdx;
    let i1 = i0 + 1;
    if (highlightAll) {
      i0 = 0;
      i1 = matches.length;
    } else if (!isSelectedPage) {
      return;
    }
    let lastDivIdx = -1;
    let lastOffset = -1;
    for (let i = i0; i < i1; i++) {
      const match = matches[i];
      const begin = match.begin;
      if (begin.divIdx === lastDivIdx && begin.offset === lastOffset) {
        continue;
      }
      lastDivIdx = begin.divIdx;
      lastOffset = begin.offset;
      const end = match.end;
      const isSelected = isSelectedPage && i === selectedMatchIdx;
      const highlightSuffix = isSelected ? " selected" : "";
      let selectedLeft = 0;
      if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
        if (prevEnd !== null) {
          appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
        }
        beginText(begin);
      } else {
        appendTextToDiv(prevEnd.divIdx, prevEnd.offset, begin.offset);
      }
      if (begin.divIdx === end.divIdx) {
        selectedLeft = appendTextToDiv(begin.divIdx, begin.offset, end.offset, `highlight${highlightSuffix}`);
      } else {
        selectedLeft = appendTextToDiv(begin.divIdx, begin.offset, infinity.offset, `highlight begin${highlightSuffix}`);
        for (let n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
          textDivs[n0].className = `highlight middle${highlightSuffix}`;
        }
        beginText(end, `highlight end${highlightSuffix}`);
      }
      prevEnd = end;
      if (isSelected) {
        findController.scrollMatchIntoView({
          element: textDivs[begin.divIdx],
          selectedLeft,
          pageIndex: pageIdx,
          matchIndex: selectedMatchIdx,
        });
      }
    }
    if (prevEnd) {
      appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
    }
  }

  private _updateMatches(reset = false) {
    if (!this.enabled && !reset) {
      return;
    }
    const { findController, matches, pageIdx } = this;
    const { textContentItemsStr, textDivs } = this;
    if (!textContentItemsStr || !textDivs) {
      return;
    }
    let clearedUntilDivIdx = -1;
    for (const match of matches) {
      const begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
      for (let n = begin, end = match.end.divIdx; n <= end; n++) {
        const div = textDivs[n];
        div.textContent = textContentItemsStr[n];
        div.className = "";
      }
      clearedUntilDivIdx = match.end.divIdx + 1;
    }
    if (!findController?.highlightMatches || reset) {
      return;
    }
    const pageMatches = findController.pageMatches[pageIdx] ?? null;
    const pageMatchesLength = findController.pageMatchesLength[pageIdx] ?? null;
    this.matches = this._convertMatches(pageMatches, pageMatchesLength);
    this._renderMatches(this.matches);
  }
}
