"use client";

export type HeroCursorPoint = {
  x: number;
  y: number;
};

export type HeroReplayEvent =
  | {
      at: number;
      type: "cursor";
      position: keyof HeroScenario["cursorPoints"];
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
    };

export type HeroScenario = {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  bookTitle: string;
  chapterTitle: string;
  actionLabel: string;
  userMessage: string;
  assistantLabel: string;
  readerParagraphs: string[];
  selectedText: string;
  responseChunks: string[];
  cursorPoints: {
    idle: HeroCursorPoint;
    selectionStart: HeroCursorPoint;
    selectionEnd: HeroCursorPoint;
    button: HeroCursorPoint;
  };
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
      "Doyle is using this description to make the moor feel eerie and unreal before the characters even arrive. ",
      "Words like \"gray,\" \"melancholy,\" \"jagged,\" and \"dim and vague\" turn the landscape into something emotionally threatening, not just physically distant. ",
      "The comparison to \"some fantastic landscape in a dream\" suggests that the place feels uncanny and half-unreal, ",
      "which prepares the reader for the mystery and dread surrounding Baskerville Hall.",
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
      { at: 4100, type: "assistant-chunk", text: "Doyle is using this description to make the moor feel eerie and unreal before the characters even arrive. " },
      { at: 5150, type: "assistant-chunk", text: "Words like \"gray,\" \"melancholy,\" \"jagged,\" and \"dim and vague\" turn the landscape into something emotionally threatening, not just physically distant. " },
      { at: 6480, type: "assistant-chunk", text: "The comparison to \"some fantastic landscape in a dream\" suggests that the place feels uncanny and half-unreal, " },
      { at: 7700, type: "assistant-chunk", text: "which prepares the reader for the mystery and dread surrounding Baskerville Hall." },
    ],
    loopAfterMs: 10500,
  },
];
