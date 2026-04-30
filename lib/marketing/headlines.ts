/**
 * Hero headlines for the landing page.
 *
 * The active pool below is restricted to "positioning-grade" copy — lines
 * that tell a first-time visitor what Minerva Reader IS, in a single glance.
 *
 * Picked once per server render via `pickHeadline()`, so different visitors
 * (and the same visitor across reloads) see variety without any in-page
 * animation competing with the typewriter placeholder.
 *
 * Lines that are clever, niche, or pain-focused are kept below in comments
 * for future use (retargeting ads, blog headers, social copy) — they're great
 * once the visitor already knows the brand, but wrong for the cold first
 * impression.
 */

export const HEADLINES = [
  // --- POSITIONING POOL (live) ---------------------------------------
  "Not a summary app. A reading app.",
  "Read first. Ask second.",
  "Search across your entire book collection",
  "Search an author's entire body of work in seconds",
  "Cross-reference ideas across 10 books at once",
  "Stop copy-pasting passages into ChatGPT",
  "One tap to navigate to any reference",
  "Every obscure reference, explained in context",

  // --- COMMENTED OUT: pain-focused, assume reader has felt the problem
  // "Stop losing your place in dense books",
  // "Find that quote you half-remember",
  // "That passage you skipped? It actually makes sense now.",

  // --- COMMENTED OUT: use-case rather than positioning
  // "Prep for book club in 5 minutes",

  // --- COMMENTED OUT: too vague for cold first impression
  // "Search the canon",

  // --- COMMENTED OUT: niche / inside-baseball references
  // "Now you can finally understand Hegel",
  // "Did Dumbledore really ask calmly? Now you can check.",
  // "Call me Ishmael. Or just search for him.",
  // "MLA format not included",
  // "Ask Machiavelli and Buddha the same question",
  // "Settle the free will debate once and for all",
  // "When is retreat wisdom? Ask five generals at once.",
  // "Plot twist: the footnotes were useful",
  // "Upload your entire pogonology collection",
  // "Finally understand that Latin phrase Nietzsche dropped",
];

/** Pick a random headline from the live pool. Called once per server render. */
export function pickHeadline(): string {
  return HEADLINES[Math.floor(Math.random() * HEADLINES.length)];
}
