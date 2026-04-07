export interface DemoChatEntry {
  question: string;
  toolCalls: { toolName: string; args: Record<string, unknown> }[];
  answer: string;
}

/**
 * Per-book demo data, keyed by book ID.
 * Used by the reader page for demo mode on curated books.
 *
 * Collection-level demos are now stored in the `collection_demos` DB table
 * and managed via the admin page.
 */
export const DEMO_DATA: Record<string, DemoChatEntry[]> = {};
