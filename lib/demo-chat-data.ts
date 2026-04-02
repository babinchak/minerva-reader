export interface DemoChatEntry {
  question: string;
  toolCalls: { toolName: string; args: Record<string, unknown> }[];
  answer: string; // Markdown with real ref: links
}

/**
 * Map of bookId → demo chat entries.
 *
 * To populate for a curated book:
 * 1. Query `embedding_sections` for the book to get real section IDs
 * 2. Write 3-5 representative questions
 * 3. Include realistic tool call sequences (vector_search, text_search, get_passages)
 * 4. Write answers with real `ref:<section_id>?p=N&ro=M` navigable references
 *
 * Example entry format:
 * ```
 * "book-uuid-here": [
 *   {
 *     question: "What is the significance of the Grimpen Mire?",
 *     toolCalls: [
 *       { toolName: "vector_search", args: { query: "Grimpen Mire significance danger" } },
 *       { toolName: "text_search", args: { query: "Grimpen | mire | bog" } },
 *     ],
 *     answer: "The Grimpen Mire serves as both a physical and symbolic barrier...\n\n[ref:section-uuid?p=87](ref:section-uuid?p=87)"
 *   },
 * ]
 * ```
 */
export const DEMO_DATA: Record<string, DemoChatEntry[]> = {};
