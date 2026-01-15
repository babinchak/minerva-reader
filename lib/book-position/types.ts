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

export interface TextSelectionResult {
  selection: Selection | null;
  range: Range | null;
  targetDoc: Document;
}
