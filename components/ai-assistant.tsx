"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const openedViaRequestRunRef = useRef(false);
  const [autoRun, setAutoRun] = useState<{ nonce: number; action: "page" | "selection" } | null>(
    null
  );
  const nonceRef = useRef(0);
  const lastExternalNonceRef = useRef<number | null>(null);
  const lastOpenNonceRef = useRef<number | null>(null);

  const openAndRun = useCallback((action: "page" | "selection", viaRequestRun: boolean) => {
    if (viaRequestRun) openedViaRequestRunRef.current = true; // Set BEFORE setState so isOpen effect sees it
    const nextNonce = nonceRef.current + 1;
    nonceRef.current = nextNonce;
    setIsOpen(true);
    setAutoRun({ nonce: nextNonce, action });
  }, []);

  // IMPORTANT: requestRun effect must run BEFORE isOpen effect so openedViaRequestRunRef is set
  // before we check it. Effects run in declaration order.
  useEffect(() => {
    if (!requestRun) return;
    if (requestRun.nonce === lastExternalNonceRef.current) return;
    lastExternalNonceRef.current = requestRun.nonce;
    openedViaRequestRunRef.current = true;
    openAndRun(requestRun.action, true);
  }, [requestRun, openAndRun]);

  useEffect(() => {
    if (!isOpen) {
      openedViaRequestRunRef.current = false;
      onOpenChange?.(false);
      return;
    }
    if (openedViaRequestRunRef.current) {
      return; // Defer onOpenChange until onActionComplete - avoids parent re-render that unmounts panel
    }
    const t = setTimeout(() => onOpenChange?.(isOpen), 0);
    return () => clearTimeout(t);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!requestOpen) return;
    if (requestOpen.nonce === lastOpenNonceRef.current) return;
    lastOpenNonceRef.current = requestOpen.nonce;
    setIsOpen(true);
  }, [requestOpen]);

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

  const handleActionComplete = useCallback(() => {
    if (openedViaRequestRunRef.current) {
      openedViaRequestRunRef.current = false;
      onOpenChange?.(true);
    }
  }, [onOpenChange]);

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
      showSelectionChip: true,
      onClose: () => setIsOpen(false),
      onActionComplete: handleActionComplete,
    }),
    [autoRun, bookId, bookType, currentPage, pdfDocument, rawManifest, selectedText, handleActionComplete]
  );

  return (
    <div
      className="relative h-full border-l border-border bg-background shadow-lg flex flex-col transition-[width] duration-200 ease-out"
      style={{
        width: isOpen ? `${dockWidth}px` : 0,
        minWidth: 0,
        overflow: "hidden",
        flexShrink: 0,
      }}
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
      <AIAgentPanel {...panelProps} className="h-full w-full flex flex-col min-w-0" />
    </div>
  );
}

