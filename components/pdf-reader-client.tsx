"use client";

import { PdfReader } from "@/components/pdf-reader";

interface PdfReaderClientProps {
  pdfUrl: string;
  fileName?: string | null;
  bookId: string;
}

export default function PdfReaderClient(props: PdfReaderClientProps) {
  return <PdfReader {...props} />;
}

