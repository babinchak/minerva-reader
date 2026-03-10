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
    title: "See the meaning in a single line.",
    subtitle:
      "Highlight a passage and get an explanation that stays grounded in the exact text you selected.",
    bookTitle: "The Hound of the Baskervilles",
    chapterTitle: "Chapter VI - Baskerville Hall",
    paneIntro: "Highlight any passage and ask Minerva to explain it in context.",
    modeBadge: "Quick mode",
    interactionMode: "reader-action",
    actionLabel: "Explain selection",
    userMessage: "Explain selection",
    assistantLabel: "Minerva",
    readerParagraphs: [
      "\"I've been over a good part of the world since I left it, Dr. Watson,\" said he; \"but I have never seen a place to compare with it.\"",
      "\"I never saw a Devonshire man who did not swear by his county,\" I remarked.",
      "Over the green squares of the fields and the low curve of a wood there rose in the distance a gray, melancholy hill, with a strange jagged summit, dim and vague in the distance, like some fantastic landscape in a dream. Baskerville sat for a long time, his eyes fixed upon it, and I read upon his eager face how much it meant to him, this first sight of that strange spot where the men of his blood had held sway so long and left their mark so deep.",
    ],
    selectedText:
      "a gray, melancholy hill, with a strange jagged summit, dim and vague in the distance, like some fantastic landscape in a dream",
    responseChunks: [
      "## What Doyle is doing here\n\nDoyle makes the moor feel **eerie and unreal** before the characters even arrive.\n\n",
      "Words like **\"gray,\" \"melancholy,\" \"jagged,\"** and **\"dim and vague\"** turn the landscape into something emotionally threatening, not just physically distant.\n\n",
      "## Why it matters\n\n- The phrase **\"like some fantastic landscape in a dream\"** makes the setting feel uncanny and half-unreal.\n",
      "- That mood prepares the reader for the mystery and dread surrounding Baskerville Hall.",
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
        text: "## What Doyle is doing here\n\nDoyle makes the moor feel **eerie and unreal** before the characters even arrive.\n\n",
      },
      {
        at: 5150,
        type: "assistant-chunk",
        text: "Words like **\"gray,\" \"melancholy,\" \"jagged,\"** and **\"dim and vague\"** turn the landscape into something emotionally threatening, not just physically distant.\n\n",
      },
      {
        at: 6480,
        type: "assistant-chunk",
        text: "## Why it matters\n\n- The phrase **\"like some fantastic landscape in a dream\"** makes the setting feel uncanny and half-unreal.\n",
      },
      {
        at: 7700,
        type: "assistant-chunk",
        text: "- That mood prepares the reader for the mystery and dread surrounding Baskerville Hall.",
      },
    ],
    loopAfterMs: 10500,
  },
  {
    id: "hound-deep-mode",
    label: "Deep mode",
    title: "Search themes across the whole book.",
    subtitle:
      "Ask broader questions and let Minerva search semantically across the novel before it answers.",
    bookTitle: "The Hound of the Baskervilles",
    chapterTitle: "Chapter VII - The Stapletons of Merripit House",
    modeBadge: "Deep mode",
    interactionMode: "ai-composer",
    actionLabel: "Deep mode",
    userMessage: "How does Doyle use the moor to create fear across the book?",
    assistantLabel: "Minerva",
    composerPlaceholder: "Ask a question about the book...",
    readerParagraphs: [
      "The longer one stays upon the moor the more does its grim charm sink into the soul, its vastness, and also its grim charm. When once you are out upon its bosom you have left all traces of modern England behind you, but on the other hand you are conscious everywhere of the homes and the work of the prehistoric people.",
      "As far as the eye can reach there is nothing but a sea of green rolling swells, broken by jagged summits and sinister hills. Here and there a tor or a gray stone outcropping catches the last of the light, while below the low places are dark with the shadows of the drifting clouds.",
      "Watson could not shake the sense that the moor itself was watching, withholding answers while every path seemed to lead deeper into uncertainty.",
    ],
    responseChunks: [
      "## Across the book\n\nDoyle turns the moor into a source of fear by making it feel both **physically dangerous** and **psychologically unstable**.\n\n",
      "## How the moor builds fear\n\n- Its silence, shifting weather, hidden paths, and strange sounds make the landscape itself feel complicit in the mystery.\n",
      "- Because the moor feels vast and unreadable, every clue stays uncertain until Holmes can impose order on it.",
    ],
    toolCalls: [
      {
        label: "Semantic search",
        detail: "moor fear atmosphere suspicion across the novel",
      },
      {
        label: "Text search",
        detail: "\"moor\" + \"fear\" + \"sound\" + \"dark\"",
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
        text: "## Across the book\n\nDoyle turns the moor into a source of fear by making it feel both **physically dangerous** and **psychologically unstable**.\n\n",
      },
      {
        at: 6640,
        type: "assistant-chunk",
        text: "## How the moor builds fear\n\n- Its silence, shifting weather, hidden paths, and strange sounds make the landscape itself feel complicit in the mystery.\n",
      },
      {
        at: 7720,
        type: "assistant-chunk",
        text: "- Because the moor feels vast and unreadable, every clue stays uncertain until Holmes can impose order on it.",
      },
    ],
    loopAfterMs: 11000,
  },
];
