"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useMemo, useRef, useState } from "react";
import { AIRail } from "@/components/ai-rail";
import { AIBottomDrawer } from "@/components/ai-bottom-drawer";
import { AIAgentPanel } from "@/components/ai-agent-pane";
import { useIsMobile } from "@/lib/use-media-query";

export interface AIAssistantProps {
  selectedText?: string;
  bookId?: string;
  rawManifest?: { readingOrder?: Array<{ href?: string }> };
  bookType: "epub" | "pdf";
  /** Current PDF page number (1-based). Used for context hint and including page in typed questions. */
  currentPage?: number;
  /** PDF document for extracting text from arbitrary pages (local context). */
  pdfDocument?: PDFDocumentProxy | null;
  mobileDrawerMinMode?: "closed" | "quick";
  /**
   * Optional external trigger to open the desktop AI pane and run an action.
   * Used by reader toolbars (e.g. PDF) to drive "Explain selection/section".
   */
  requestRun?: { nonce: number; action: "page" | "selection" } | null;
  /**
   * Optional external trigger to open the desktop AI pane without auto-running.
   * Used by reader toolbars (e.g. PDF) "Ask Minerva" button.
   */
  requestOpen?: { nonce: number } | null;
  /**
   * Called when the desktop AI pane opens or closes. Used to hide toolbar buttons (e.g. "Ask Minerva") when the pane is open.
   */
  onOpenChange?: (open: boolean) => void;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function AIAssistant(props: AIAssistantProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
  return (
    <AIBottomDrawer
      selectedText={props.selectedText}
      bookId={props.bookId}
      rawManifest={props.rawManifest}
      bookType={props.bookType}
      currentPage={props.currentPage}
      pdfDocument={props.pdfDocument}
      minMode={props.mobileDrawerMinMode}
    />
  );
  }
  return <DesktopAIAssistant {...props} />;
}

function DesktopAIAssistant({
  selectedText,
  bookId,
  rawManifest,
  bookType,
  currentPage,
  pdfDocument,
  requestRun = null,
  requestOpen = null,
  onOpenChange,
}: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);
  const [autoRun, setAutoRun] = useState<{ nonce: number; action: "page" | "selection" } | null>(
    null
  );
  const nonceRef = useRef(0);
  const lastExternalNonceRef = useRef<number | null>(null);
  const lastOpenNonceRef = useRef<number | null>(null);

  const openAndRun = (action: "page" | "selection") => {
    setIsOpen(true);
    nonceRef.current += 1;
    setAutoRun({ nonce: nonceRef.current, action });
  };

  useEffect(() => {
    if (!requestRun) return;
    if (requestRun.nonce === lastExternalNonceRef.current) return;
    lastExternalNonceRef.current = requestRun.nonce;
    openAndRun(requestRun.action);
  }, [requestRun]);

  useEffect(() => {
    if (!requestOpen) return;
    if (requestOpen.nonce === lastOpenNonceRef.current) return;
    lastOpenNonceRef.current = requestOpen.nonce;
    setIsOpen(true);
  }, [requestOpen]);

  // PDF: docked + resizable width. EPUB: overlay fixed drawer.
  const isPdf = bookType === "pdf";
  const [dockWidth, setDockWidth] = useState(384); // 24rem
  const resizingRef = useRef<{ startX: number; startW: number; pointerId: number } | null>(null);

  const startResize = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizingRef.current = { startX: e.clientX, startW: dockWidth, pointerId: e.pointerId };
  };

  const moveResize = (e: React.PointerEvent) => {
    const r = resizingRef.current;
    if (!r || r.pointerId !== e.pointerId) return;
    const delta = r.startX - e.clientX; // dragging left increases width
    setDockWidth(clamp(r.startW + delta, 280, 640));
  };

  const endResize = (e: React.PointerEvent) => {
    const r = resizingRef.current;
    if (!r || r.pointerId !== e.pointerId) return;
    resizingRef.current = null;
  };

  const panelProps = useMemo(
    () => ({
      selectedText,
      bookId,
      rawManifest,
      bookType,
      currentPage,
      pdfDocument,
      autoRun,
      hideInputUntilFirstResponse: true,
      includeSelectionContextOnSend: true,
      onClose: () => setIsOpen(false),
    }),
    [autoRun, bookId, bookType, currentPage, pdfDocument, rawManifest, selectedText]
  );

  return (
    <>
      {!isOpen && bookType !== "pdf" && (
        <AIRail
          selectedText={selectedText}
          onActivate={(action) => openAndRun(action)}
        />
      )}

      {isOpen && isPdf && (
        <div
          className="relative h-full border-l border-border bg-background shadow-lg flex flex-col"
          style={{ width: `${dockWidth}px` }}
        >
          <div
            className="absolute -left-1 top-0 h-full w-2 cursor-col-resize touch-none z-50"
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label="Resize AI panel"
            role="separator"
            aria-orientation="vertical"
          />
          <AIAgentPanel {...panelProps} className="h-full w-full flex flex-col" />
        </div>
      )}

      {isOpen && !isPdf && (
        <>
          <button
            type="button"
            aria-label="Close AI assistant"
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setIsOpen(false)}
          />
          <AIAgentPanel
            {...panelProps}
            className="fixed right-0 top-0 z-50 h-full w-96 bg-background border-l border-border shadow-lg flex flex-col select-text"
          />
        </>
      )}
    </>
  );
}

