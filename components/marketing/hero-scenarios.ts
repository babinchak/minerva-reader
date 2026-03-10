"use client";

export type HeroCursorPoint = {
  x: number;
  y: number;
};

export type HeroToolCall = {
  label: string;
  detail: string;
};

export type HeroReplayEvent =
  | {
      at: number;
      type: "cursor";
      position: string;
      durationMs?: number;
    }
  | {
      at: number;
      type: "selection";
      active: boolean;
    }
  | {
      at: number;
      type: "button-hover";
      active: boolean;
    }
  | {
      at: number;
      type: "button-press";
      active: boolean;
    }
  | {
      at: number;
      type: "user-message";
    }
  | {
      at: number;
      type: "typing";
      active: boolean;
    }
  | {
      at: number;
      type: "assistant-chunk";
      text: string;
    }
  | {
      at: number;
      type: "tool-call";
      index: number;
    }
  | {
      at: number;
      type: "composer-chunk";
      text: string;
    }
  | {
      at: number;
      type: "composer-send";
      active: boolean;
    };

export type HeroScenario = {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  bookTitle: string;
  chapterTitle: string;
  paneIntro?: string;
  modeBadge: string;
  interactionMode: "reader-action" | "ai-composer";
  actionLabel: string;
  userMessage: string;
  userLocationLabel?: string;
  userLocationTitle?: string;
  assistantLabel: string;
  readerParagraphs: string[];
  selectedText?: string;
  responseChunks: string[];
  toolCalls?: HeroToolCall[];
  composerPlaceholder?: string;
  cursorPoints: Record<string, HeroCursorPoint>;
  events: HeroReplayEvent[];
  loopAfterMs: number;
};

export const HERO_SCENARIOS: HeroScenario[] = [
  {
    id: "hound-explain-selection",
    label: "Explain selection",
    title: "Understand a passage instantly.",
    subtitle:
      "Highlight a passage and get an explanation grounded in the exact text.",
    bookTitle: "The Hound of the Baskervilles",
    chapterTitle: "Chapter I - Mr. Sherlock Holmes",
    modeBadge: "Quick mode",
    interactionMode: "reader-action",
    actionLabel: "Explain selection",
    userMessage: "Explain selection",
    userLocationLabel: "Passage · 123:0-123:0",
    userLocationTitle:
      "Selected text from Chapter I - Mr. Sherlock Holmes",
    assistantLabel: "Minerva",
    readerParagraphs: [
      "“Really, Watson, you excel yourself,” said Holmes, pushing back his chair and lighting a cigarette. “I am bound to say that in all the accounts which you have been so good as to give of my own small achievements you have habitually underrated your own abilities.”",
      "“It may be that you are not yourself luminous, but you are a conductor of light. Some people without possessing genius have a remarkable power of stimulating it. I confess, my dear fellow, that I am very much in your debt.”",
      "He had never said as much before, and I must admit that his words gave me keen pleasure, for I had often been piqued by his indifference to my admiration and to the attempts which I had made to give publicity to his methods. I was proud, too, to think that I had so far mastered his system as to apply it in a way which earned his approval.",
    ],
    selectedText:
      "It may be that you are not yourself luminous, but you are a conductor of light. Some people without possessing genius have a remarkable power of stimulating it.",
    responseChunks: [
      "## What Holmes means\n\nHolmes is **complimenting Watson**, but in a very Holmes-like way.\n\n",
      "- **\"Not yourself luminous\"** means Watson may not be the original source of genius.\n- **\"A conductor of light\"** means he helps someone else’s brilliance shine.\n\n",
      "## The immediate context\n\nThis comes right after Watson makes a strong chain of deductions about **Dr. Mortimer’s walking-stick** and earns Holmes’s approval.\n\n",
      "- Holmes rarely praises Watson this directly.\n- Here, he is saying Watson’s observations and companionship actively **stimulate Holmes’s thinking**.\n\n",
      "## Why Doyle includes it\n\n- Watson is not just a sidekick; he is a **catalyst** for Holmes’s reasoning.\n- As narrator, he also \"conducts\" Holmes’s brilliance to the reader.",
    ],
    cursorPoints: {
      idle: { x: 18, y: 73 },
      selectionStart: { x: 23, y: 45 },
      selectionEnd: { x: 56, y: 51 },
      button: { x: 53, y: 14 },
    },
    events: [
      { at: 350, type: "cursor", position: "selectionStart", durationMs: 420 },
      { at: 850, type: "selection", active: true },
      { at: 850, type: "cursor", position: "selectionEnd", durationMs: 900 },
      { at: 2050, type: "button-hover", active: true },
      { at: 2050, type: "cursor", position: "button", durationMs: 460 },
      { at: 2650, type: "button-press", active: true },
      { at: 2830, type: "button-press", active: false },
      { at: 2910, type: "button-hover", active: false },
      { at: 3080, type: "user-message" },
      { at: 3420, type: "typing", active: true },
      { at: 4100, type: "typing", active: false },
      {
        at: 4100,
        type: "assistant-chunk",
        text: "## What Holmes means\n\nHolmes is **complimenting Watson**, but in a very Holmes-like way.\n\n",
      },
      {
        at: 5000,
        type: "assistant-chunk",
        text: "- **\"Not yourself luminous\"** means Watson may not be the original source of genius.\n- **\"A conductor of light\"** means he helps someone else’s brilliance shine.\n\n",
      },
      {
        at: 6150,
        type: "assistant-chunk",
        text: "## The immediate context\n\nThis comes right after Watson makes a strong chain of deductions about **Dr. Mortimer’s walking-stick** and earns Holmes’s approval.\n\n",
      },
      {
        at: 7400,
        type: "assistant-chunk",
        text: "- Holmes rarely praises Watson this directly.\n- Here, he is saying Watson’s observations and companionship actively **stimulate Holmes’s thinking**.\n\n",
      },
      {
        at: 8700,
        type: "assistant-chunk",
        text: "## Why Doyle includes it\n\n- Watson is not just a sidekick; he is a **catalyst** for Holmes’s reasoning.\n- As narrator, he also \"conducts\" Holmes’s brilliance to the reader.",
      },
    ],
    loopAfterMs: 12200,
  },
  {
    id: "hound-deep-mode",
    label: "Deep mode",
    title: "Search themes across the whole book.",
    subtitle:
      "Ask broader questions and let Minerva search across the book before answering.",
    bookTitle: "The Hound of the Baskervilles",
    chapterTitle: "Chapter IV - Sir Henry Baskerville",
    modeBadge: "Deep mode",
    interactionMode: "ai-composer",
    actionLabel: "Deep mode",
    userMessage: "How does Doyle use the moor to create fear across the book?",
    userLocationLabel: "Page 34",
    userLocationTitle:
      "Context from page 34 in The Hound of the Baskervilles",
    assistantLabel: "Minerva",
    composerPlaceholder: "Ask a question about the book...",
    readerParagraphs: [
      "He laid an envelope upon the table, and we all bent over it. It was of common quality, greyish in colour. The address, “Sir Henry Baskerville, Northumberland Hotel,” was printed in rough characters; the post-mark “Charing Cross,” and the date of posting the preceding evening.",
      "Across the middle of it a single sentence had been formed by the expedient of pasting printed words upon it. It ran: As you value your life or your reason keep away from the moor. The word “moor” only was printed in ink.",
      "So the moor enters the story as a threat before Watson ever reaches it: not just a place of danger, but a place linked to fear, surveillance, and the possibility of madness.",
    ],
    responseChunks: [
      "## The moor as a machine for fear\n\nAcross the novel, Doyle uses the moor not just as scenery but as a **Gothic engine** that produces fear.\n\n",
      "## Why this warning matters\n\n> **As you value your life or your reason keep away from the moor.**\n\nThe threat works because the moor is dangerous not only to **life**, but to **reason** itself.\n\n",
      "## How Doyle builds that fear\n\n- The moor is framed by **legend** before we even arrive.\n- Its distance and sparseness make characters feel **isolated**.\n",
      "- Fog, darkness, and strange sounds turn the landscape into a place where perception cannot be trusted.",
    ],
    toolCalls: [
      {
        label: "Semantic search",
        detail:
          "Doyle description of the moor creating fear bleak desolate Grimpen Mire fog tors unearthly howling baying atmosphere",
      },
      {
        label: "Text search",
        detail:
          "moor | Dartmoor | Grimpen | mire | fog | tors | baying | howl | waste | desolate",
      },
    ],
    cursorPoints: {
      idle: { x: 18, y: 73 },
      composerInput: { x: 78, y: 82 },
      composerSend: { x: 92, y: 82 },
    },
    events: [
      { at: 420, type: "cursor", position: "composerInput", durationMs: 520 },
      { at: 1120, type: "composer-chunk", text: "How does Doyle use " },
      { at: 1520, type: "composer-chunk", text: "the moor to create fear " },
      { at: 1940, type: "composer-chunk", text: "across the book?" },
      { at: 2580, type: "cursor", position: "composerSend", durationMs: 360 },
      { at: 3020, type: "composer-send", active: true },
      { at: 3190, type: "composer-send", active: false },
      { at: 3380, type: "user-message" },
      { at: 3880, type: "tool-call", index: 0 },
      { at: 4560, type: "tool-call", index: 1 },
      { at: 5280, type: "typing", active: true },
      { at: 5800, type: "typing", active: false },
      {
        at: 5800,
        type: "assistant-chunk",
        text: "## The moor as a machine for fear\n\nAcross the novel, Doyle uses the moor not just as scenery but as a **Gothic engine** that produces fear.\n\n",
      },
      {
        at: 6640,
        type: "assistant-chunk",
        text: "## Why this warning matters\n\n> **As you value your life or your reason keep away from the moor.**\n\nThe threat works because the moor is dangerous not only to **life**, but to **reason** itself.\n\n",
      },
      {
        at: 7720,
        type: "assistant-chunk",
        text: "## How Doyle builds that fear\n\n- The moor is framed by **legend** before we even arrive.\n- Its distance and sparseness make characters feel **isolated**.\n",
      },
      {
        at: 9000,
        type: "assistant-chunk",
        text: "- Fog, darkness, and strange sounds turn the landscape into a place where perception cannot be trusted.",
      },
    ],
    loopAfterMs: 12500,
  },
];
