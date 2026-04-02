"use client";

import { PdfReader } from "@/components/pdf-reader";

interface PdfReaderClientProps {
  pdfUrl: string;
  fileName?: string | null;
  bookId: string;
  initialPage?: number;
  initialBookmarks?: number[];
  isLoggedIn?: boolean;
  demoMode?: boolean;
  demoEntries?: import("@/lib/demo-chat-data").DemoChatEntry[];
}

export default function PdfReaderClient(props: PdfReaderClientProps) {
  return <PdfReader {...props} />;
}

