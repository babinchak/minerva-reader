/**
 * Short preview questions for the landing page typewriter placeholder.
 *
 * Different from the response-wall demos: these are SHORT (≤ ~40 chars),
 * google-search-style prompts whose job is to *invite* a question, not to
 * showcase depth. The wall handles the depth showcase.
 *
 * Keep each question:
 * - 2-7 words
 * - Recognizable / curiosity-bait, not deep
 * - Fits on one line of the search bar at any reasonable viewport
 *
 * Falls back to a length-filtered subset of c.demos when a slug isn't listed.
 */

export const PREVIEW_QUESTIONS_BY_SLUG: Record<string, string[]> = {
  economics: [
    "What causes inflation?",
    "What is the invisible hand?",
    "Who was right: Smith or Marx?",
    "Why does poverty persist?",
    "Why does money lose value?",
  ],
  "religion-theology": [
    "Why believe in God?",
    "What is faith?",
    "Where does evil come from?",
    "What is grace?",
    "Why does God allow suffering?",
  ],
  philosophy: [
    "What is virtue?",
    "Is free will real?",
    "Does God exist?",
    "What is justice?",
    "Are mind and body separate?",
  ],
  "military-strategy": [
    "When is retreat wisdom?",
    "What makes a great leader?",
    "Is deception necessary in war?",
    "Can you win without fighting?",
    "Why did Caesar succeed?",
  ],
  "american-founding": [
    "Why a bicameral legislature?",
    "Federalists or Anti-Federalists?",
    "What did the founders fear?",
    "Why a Bill of Rights?",
  ],
  "exploration-travel": [
    "What did Lewis & Clark find?",
    "How did Magellan navigate?",
    "Why explore the Arctic?",
    "Was exploration moral?",
  ],
  "education-pedagogy": [
    "What is liberal education?",
    "What did Plato say about school?",
    "What's the purpose of school?",
    "How do children learn?",
  ],
  "feminism-womens-rights": [
    "What did Wollstonecraft argue?",
    "Why did suffrage matter?",
    "What did Mill say about women?",
    "Where did feminism begin?",
  ],
  "fall-of-rome": [
    "Why did Rome fall?",
    "Did Christianity weaken Rome?",
    "Did Diocletian's reforms work?",
    "What can we learn from Rome?",
  ],
  "rhetoric-persuasion": [
    "What are Aristotle's three appeals?",
    "What makes good rhetoric?",
    "What did Cicero teach?",
    "What are common logical fallacies?",
  ],
};

const PREVIEW_MAX_CHARS = 60;

/**
 * Resolve preview questions for a collection slug. Falls back to a
 * length-filtered subset of the collection's demo questions when the slug
 * is not explicitly listed above (so new collections still get something
 * sensible without a code change).
 */
export function getPreviewQuestions(
  slug: string,
  fallbackDemoQuestions: string[]
): string[] {
  const explicit = PREVIEW_QUESTIONS_BY_SLUG[slug];
  if (explicit && explicit.length > 0) return explicit;
  return fallbackDemoQuestions
    .filter((q) => q.length <= PREVIEW_MAX_CHARS)
    .slice(0, 3);
}
