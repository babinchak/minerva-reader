"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  BookText,
  Highlighter,
  MessageSquareText,
  MousePointer2,
  ScanSearch,
  Search,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

import {
  HERO_SCENARIOS,
  type HeroCursorPoint,
  type HeroReplayEvent,
} from "./hero-scenarios";

type ReplayState = {
  cursor: HeroCursorPoint;
  cursorTransitionMs: number;
  selectionActive: boolean;
  buttonHover: boolean;
  buttonPressed: boolean;
  userMessageVisible: boolean;
  typingVisible: boolean;
  assistantText: string;
  visibleToolCalls: number[];
};

const INITIAL_CURSOR: HeroCursorPoint = { x: 18, y: 73 };

function renderParagraphWithSelection(
  paragraph: string,
  selectedText: string | undefined,
  selectionActive: boolean
) {
  if (!selectedText) {
    return paragraph;
  }

  const selectedIndex = paragraph.indexOf(selectedText);
  if (selectedIndex === -1) {
    return paragraph;
  }

  const before = paragraph.slice(0, selectedIndex);
  const after = paragraph.slice(selectedIndex + selectedText.length);

  return (
    <>
      {before}
      <span
        className={cn(
          "rounded-[0.35em] px-0.5 py-0.5 text-foreground decoration-transparent [box-decoration-break:clone] [-webkit-box-decoration-break:clone]",
          selectionActive ? "shadow-[0_0_0_1px_rgba(245,158,11,0.24)]" : ""
        )}
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(250,204,21,0.14) 0%, rgba(250,204,21,0.72) 100%)",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "0 100%",
          backgroundSize: selectionActive ? "100% 100%" : "0% 100%",
          transition: "background-size 900ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease",
        }}
      >
        {selectedText}
      </span>
      {after}
    </>
  );
}

function getToolIcon(label: string) {
  const normalizedLabel = label.toLowerCase();
  if (normalizedLabel.includes("semantic")) {
    return ScanSearch;
  }
  if (normalizedLabel.includes("text")) {
    return Search;
  }
  return Sparkles;
}

function applyReplayEvent(
  event: HeroReplayEvent,
  setState: Dispatch<SetStateAction<ReplayState>>
) {
  switch (event.type) {
    case "cursor":
      setState((prev) => ({
        ...prev,
        cursorTransitionMs: event.durationMs ?? 420,
      }));
      break;
    case "selection":
      setState((prev) => ({
        ...prev,
        selectionActive: event.active,
      }));
      break;
    case "button-hover":
      setState((prev) => ({
        ...prev,
        buttonHover: event.active,
      }));
      break;
    case "button-press":
      setState((prev) => ({
        ...prev,
        buttonPressed: event.active,
      }));
      break;
    case "user-message":
      setState((prev) => ({
        ...prev,
        userMessageVisible: true,
      }));
      break;
    case "typing":
      setState((prev) => ({
        ...prev,
        typingVisible: event.active,
      }));
      break;
    case "assistant-chunk":
      setState((prev) => ({
        ...prev,
        assistantText: prev.assistantText + event.text,
      }));
      break;
    case "tool-call":
      setState((prev) => ({
        ...prev,
        visibleToolCalls: prev.visibleToolCalls.includes(event.index)
          ? prev.visibleToolCalls
          : [...prev.visibleToolCalls, event.index],
      }));
      break;
    default:
      break;
  }
}

export function HeroReplay() {
  const scenarios = HERO_SCENARIOS;
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const scenario = scenarios[scenarioIndex];
  const ActionIcon =
    scenario.modeBadge.toLowerCase().includes("deep") ? Sparkles : Highlighter;

  const initialState = useMemo<ReplayState>(
    () => ({
      cursor: scenario.cursorPoints.idle ?? INITIAL_CURSOR,
      cursorTransitionMs: 0,
      selectionActive: false,
      buttonHover: false,
      buttonPressed: false,
      userMessageVisible: false,
      typingVisible: false,
      assistantText: "",
      visibleToolCalls: [],
    }),
    [scenario]
  );

  const [state, setState] = useState<ReplayState>(initialState);

  useEffect(() => {
    setState(initialState);

    const timeouts: number[] = [];

    const moveCursor = (point: HeroCursorPoint, durationMs: number) => {
      setState((prev) => ({
        ...prev,
        cursor: point,
        cursorTransitionMs: durationMs,
      }));
    };

    for (const event of scenario.events) {
      timeouts.push(
        window.setTimeout(() => {
          if (event.type === "cursor") {
            moveCursor(
              scenario.cursorPoints[event.position],
              event.durationMs ?? 420
            );
            return;
          }

          applyReplayEvent(event, setState);
        }, event.at)
      );
    }

    timeouts.push(
      window.setTimeout(() => {
        setScenarioIndex((prev) => (prev + 1) % scenarios.length);
      }, scenario.loopAfterMs)
    );

    return () => {
      for (const timeout of timeouts) {
        window.clearTimeout(timeout);
      }
    };
  }, [initialState, scenario, scenarios.length]);

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>{scenario.label}</span>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          {scenarios.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setScenarioIndex(index)}
              className={cn(
                "h-2.5 rounded-full transition-all",
                index === scenarioIndex
                  ? "w-7 bg-primary"
                  : "w-2.5 bg-border hover:bg-muted-foreground/40"
              )}
              aria-label={`Show ${item.label} demo`}
            />
          ))}
        </div>
      </div>

      <div className="relative aspect-[16/10] overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-br from-background via-background to-muted/50 p-4 shadow-[0_24px_90px_rgba(15,23,42,0.14)] sm:p-5 lg:aspect-auto lg:min-h-[34rem] xl:min-h-[38rem]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.10),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.12),transparent_30%)]" />

        <div className="absolute inset-x-[4%] top-[5%] bottom-[4%] overflow-hidden rounded-[24px] border border-border/70 bg-card/95 shadow-xl backdrop-blur-sm">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_24%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.10),transparent_22%)]" />
          <div className="relative grid h-full grid-cols-[1.55fr_minmax(0,0.95fr)]">
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center justify-between border-b border-border/60 bg-muted/35 px-[4.5%] py-[3.2%]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[0.56rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <BookText className="h-3.5 w-3.5" />
                    <span>Reader</span>
                  </div>
                  <div className="mt-1 truncate text-[0.92rem] font-semibold text-foreground">
                    {scenario.bookTitle}
                  </div>
                  <div className="truncate text-[0.72rem] text-muted-foreground">
                    {scenario.chapterTitle}
                  </div>
                </div>

                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[0.72rem] font-medium transition-all",
                    state.buttonPressed
                      ? "scale-[0.98] border-primary/70 bg-primary text-primary-foreground shadow"
                      : state.buttonHover
                        ? "border-primary/40 bg-primary/12 text-foreground shadow-sm"
                        : "border-border bg-background/85 text-foreground"
                  )}
                >
                  <ActionIcon className="h-3.5 w-3.5" />
                  <span>{scenario.actionLabel}</span>
                </button>
              </div>

              <div className="relative flex-1 overflow-hidden px-[5.5%] py-[4.6%] text-[0.84rem] leading-[1.8] text-foreground/90">
                <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-card via-card/96 to-transparent" />
                <div className="relative space-y-4">
                  {scenario.readerParagraphs.map((paragraph, index) => (
                    <p key={`${scenario.id}-paragraph-${index}`}>
                      {renderParagraphWithSelection(
                        paragraph,
                        scenario.selectedText,
                        state.selectionActive
                      )}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative flex min-w-0 flex-col border-l border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_22%)]">
              <div className="absolute inset-y-[5%] left-0 w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent" />
              <div className="flex items-center justify-between border-b border-border/60 px-[6%] py-[4.2%]">
                <div>
                  <div className="text-[0.56rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    AI pane
                  </div>
                  <div className="mt-1 text-[0.95rem] font-semibold text-foreground">
                    {scenario.assistantLabel}
                  </div>
                </div>
                <div className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[0.65rem] font-medium text-primary">
                  {scenario.modeBadge}
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2.5 px-[6%] py-[4.3%]">
                {scenario.paneIntro ? (
                  <div className="rounded-2xl border border-border/60 bg-muted/35 px-3 py-2 text-[0.74rem] text-muted-foreground">
                    {scenario.paneIntro}
                  </div>
                ) : null}

                <div className="flex-1 space-y-2.5 overflow-hidden">
                  {state.userMessageVisible && (
                    <div className="ml-auto max-w-[86%] rounded-2xl bg-primary px-3 py-2 text-[0.8rem] text-primary-foreground shadow">
                      <div className="mb-1 flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.15em] text-primary-foreground/80">
                        <MessageSquareText className="h-3 w-3" />
                        <span>User</span>
                      </div>
                      <p>{scenario.userMessage}</p>
                    </div>
                  )}

                  {scenario.toolCalls &&
                    state.visibleToolCalls.map((toolIndex) => {
                      const toolCall = scenario.toolCalls?.[toolIndex];
                      if (!toolCall) return null;

                      const ToolIcon = getToolIcon(toolCall.label);

                      return (
                        <div
                          key={`${scenario.id}-tool-${toolIndex}`}
                          className="max-w-[96%] rounded-xl border border-primary/15 bg-primary/5 px-2.5 py-1.5 text-[0.68rem] shadow-sm"
                        >
                          <div className="flex items-center gap-1.5 font-medium leading-none text-foreground">
                            <ToolIcon className="h-3 w-3 text-primary" />
                            <span>{toolCall.label}</span>
                          </div>
                          <p className="mt-0.5 truncate leading-5 text-muted-foreground">
                            {toolCall.detail}
                          </p>
                        </div>
                      );
                    })}

                  {(state.typingVisible || state.assistantText) && (
                    <div className="max-w-[95%] rounded-2xl border border-border/60 bg-background/90 px-3 py-2 text-[0.8rem] shadow-sm">
                      <div className="mb-1 flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.15em] text-muted-foreground">
                        <Sparkles className="h-3 w-3 text-primary" />
                        <span>{scenario.assistantLabel}</span>
                      </div>

                      {state.assistantText ? (
                        <p className="whitespace-pre-wrap text-foreground/90">
                          {state.assistantText}
                        </p>
                      ) : (
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.16s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.32s]" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="pointer-events-none absolute z-30 text-foreground drop-shadow-[0_10px_18px_rgba(15,23,42,0.28)]"
          style={{
            left: `${state.cursor.x}%`,
            top: `${state.cursor.y}%`,
            transform: "translate(-50%, -50%)",
            transitionProperty: "left, top, transform",
            transitionDuration: `${state.cursorTransitionMs}ms`,
            transitionTimingFunction: "cubic-bezier(0.2, 0.82, 0.24, 1)",
          }}
        >
          <MousePointer2
            className={cn(
              "h-6 w-6 fill-background",
              state.buttonPressed ? "scale-95" : "scale-100"
            )}
          />
        </div>
      </div>

      <div className="space-y-1 px-1">
        <h3 className="text-lg font-semibold text-foreground">{scenario.title}</h3>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {scenario.subtitle}
        </p>
      </div>
    </div>
  );
}
