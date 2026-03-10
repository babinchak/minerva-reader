"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  BookText,
  Highlighter,
  MousePointer2,
  ScanSearch,
  Search,
  SendHorizontal,
  Sparkles,
  Zap,
} from "lucide-react";

import { Markdown } from "@/components/markdown";
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
  composerText: string;
  composerSendPressed: boolean;
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
    case "composer-chunk":
      setState((prev) => ({
        ...prev,
        composerText: prev.composerText + event.text,
      }));
      break;
    case "composer-send":
      setState((prev) => ({
        ...prev,
        composerSendPressed: event.active,
      }));
      break;
    case "user-message":
      setState((prev) => ({
        ...prev,
        composerText: "",
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
  const isDeepMode = scenario.interactionMode === "ai-composer";
  const quickScenarioIndex = scenarios.findIndex(
    (item) => item.interactionMode === "reader-action"
  );
  const deepScenarioIndex = scenarios.findIndex(
    (item) => item.interactionMode === "ai-composer"
  );
  const ActionIcon =
    scenario.modeBadge.toLowerCase().includes("deep") ? Sparkles : Highlighter;

  const initialState = useMemo<ReplayState>(
    () => ({
      cursor: scenario.cursorPoints.idle ?? INITIAL_CURSOR,
      cursorTransitionMs: 0,
      selectionActive: false,
      buttonHover: false,
      buttonPressed: false,
      composerText: "",
      composerSendPressed: false,
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
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs shadow-sm backdrop-blur",
            isDeepMode
              ? "border-blue-500/20 text-blue-200/85"
              : "border-amber-500/20 text-muted-foreground"
          )}
        >
          <Sparkles
            className={cn("h-3.5 w-3.5", isDeepMode ? "text-blue-400" : "text-primary")}
          />
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
                  ? cn(
                      "w-7",
                      isDeepMode ? "bg-blue-500" : "bg-primary"
                    )
                  : "w-2.5 bg-border hover:bg-muted-foreground/40"
              )}
              aria-label={`Show ${item.label} demo`}
            />
          ))}
        </div>
      </div>

      <div className="relative aspect-[16/10] overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-br from-background via-background to-muted/50 p-4 shadow-[0_24px_90px_rgba(15,23,42,0.14)] sm:p-5 lg:aspect-auto lg:min-h-[34rem] xl:min-h-[38rem]">
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            isDeepMode
              ? "bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.18),transparent_32%)]"
              : "bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.16),transparent_30%)]"
          )}
        />

        <div className="absolute inset-x-[4%] top-[5%] bottom-[4%] overflow-hidden rounded-[24px] border border-border/70 bg-card/95 shadow-xl backdrop-blur-sm">
          <div
            className={cn(
              "pointer-events-none absolute inset-0",
              isDeepMode
                ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_24%)]"
                : "bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_24%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.10),transparent_22%)]"
            )}
          />
          <div
            className={cn(
              "relative grid h-full",
              isDeepMode
                ? "grid-cols-[1.42fr_minmax(0,1.08fr)]"
                : "grid-cols-[1.55fr_minmax(0,0.95fr)]"
            )}
          >
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

                {scenario.interactionMode === "reader-action" ? (
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
                ) : null}
              </div>

              <div className="relative flex-1 overflow-hidden px-[5.5%] py-[4.6%] text-[0.82rem] leading-[1.65] text-foreground/90">
                <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-card via-card/96 to-transparent" />
                <div className="relative space-y-3">
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDeepMode}
                    aria-label={
                      isDeepMode
                        ? "Deep mode (tools: semantic and text search)"
                        : "Fast mode (single answer)"
                    }
                    title={
                      isDeepMode
                        ? "Deep mode (tools: semantic and text search)"
                        : "Fast mode (single answer)"
                    }
                    onClick={() => {
                      if (isDeepMode && quickScenarioIndex >= 0) {
                        setScenarioIndex(quickScenarioIndex);
                      } else if (!isDeepMode && deepScenarioIndex >= 0) {
                        setScenarioIndex(deepScenarioIndex);
                      }
                    }}
                    className={cn(
                      "relative flex h-6 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200",
                      isDeepMode
                        ? "bg-blue-500 dark:bg-blue-600"
                        : "bg-amber-400 dark:bg-amber-500"
                    )}
                  >
                    <Zap
                      className="absolute left-1 h-3.5 w-3.5 shrink-0 text-amber-900 dark:text-amber-950"
                      aria-hidden
                    />
                    <Sparkles
                      className="absolute right-1.5 h-3.5 w-3.5 shrink-0 text-blue-900 dark:text-blue-950"
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "absolute top-0.5 h-5 w-6 rounded-full bg-white shadow-md transition-all duration-200",
                        isDeepMode
                          ? "left-0.5"
                          : "left-[calc(100%-1.5rem-2px)]"
                      )}
                      aria-hidden
                    />
                  </button>
                  <span className="text-[0.68rem] font-medium text-muted-foreground">
                    {isDeepMode ? "Deep" : "Fast"}
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2.5 px-[6%] py-[4.3%]">
                {scenario.paneIntro ? (
                  <div className="rounded-2xl border border-border/60 bg-muted/35 px-3 py-2 text-[0.74rem] text-muted-foreground">
                    {scenario.paneIntro}
                  </div>
                ) : null}

                <div className="flex-1 space-y-3 overflow-hidden">
                  {state.userMessageVisible && (
                    <div className="ml-auto max-w-[86%] rounded-2xl bg-primary px-3 py-1.5 text-[0.78rem] leading-[1.32] text-primary-foreground shadow">
                      <p>{scenario.userMessage}</p>
                      {scenario.userLocationLabel ? (
                        <div className="mt-1.5">
                          <span
                            title={scenario.userLocationTitle}
                            className="inline-flex items-center rounded-full border border-primary-foreground/35 bg-primary-foreground/10 px-1.5 py-0.5 text-[0.66rem] font-medium leading-none text-primary-foreground/75"
                          >
                            {scenario.userLocationLabel}
                          </span>
                        </div>
                      ) : null}
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
                          <p className="mt-1 truncate leading-5 text-muted-foreground">
                            {toolCall.detail}
                          </p>
                        </div>
                      );
                    })}

                  {(state.typingVisible || state.assistantText) && (
                    <div className="w-full pt-0.5">
                      {state.assistantText ? (
                        <Markdown
                          content={state.assistantText}
                          className="space-y-1.5 text-[0.8rem] leading-[1.54] text-foreground/90 [&_h1]:!mt-0 [&_h1]:!mb-1 [&_h1]:text-[1.02rem] [&_h1]:font-bold [&_h1]:leading-5 [&_h1]:text-foreground [&_h2]:!mt-0 [&_h2]:!mb-1.5 [&_h2]:text-[0.96rem] [&_h2]:font-bold [&_h2]:leading-5 [&_h2]:text-foreground [&_h3]:!mt-0 [&_h3]:!mb-1.25 [&_h3]:text-[0.9rem] [&_h3]:font-semibold [&_h3]:leading-5 [&_h3]:text-foreground [&_p]:!mt-0 [&_p]:!mb-1 [&_p]:text-[0.8rem] [&_p]:leading-[1.54] [&_ul]:!my-0 [&_ul]:space-y-0.5 [&_ul]:pl-4 [&_li]:leading-[1.54] [&_strong]:font-semibold"
                        />
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

                {scenario.interactionMode === "ai-composer" && (
                  <div className="rounded-2xl border border-border/60 bg-background/80 px-2.5 py-2 shadow-sm">
                    <div className="flex items-end gap-2">
                      <div className="min-h-[2.5rem] flex-1 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-[0.76rem] leading-5 text-foreground/90">
                        {state.composerText ? (
                          <span>{state.composerText}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {scenario.composerPlaceholder}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-all",
                          state.composerSendPressed
                            ? "scale-[0.97] border-primary/70 bg-primary text-primary-foreground shadow"
                            : "border-border bg-background text-foreground"
                        )}
                        aria-label="Send question"
                      >
                        <SendHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
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
