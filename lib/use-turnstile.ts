"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "invisible";
          appearance?: "always" | "execute" | "interaction-only";
        }
      ) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
      getResponse: (id?: string) => string | undefined;
    };
  }
}

export type UseTurnstileResult = {
  /** Whether a fresh token is available (or Turnstile is disabled, in which case sends always proceed). */
  ready: boolean;
  /** Mutable ref holding the current single-use token. Read at send time. */
  tokenRef: React.MutableRefObject<string | null>;
  /** Attach to the hidden container div the widget renders into. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Pass to <Script onLoad>. Renders the widget once the SDK is ready. */
  onScriptLoad: () => void;
  /** Call after each successful send. Tokens are single-use; this requests a new one. */
  resetAfterSend: () => void;
  /** True when the widget should render (i.e. caller is anon AND Turnstile is configured). */
  shouldRender: boolean;
  /** The Turnstile script src — caller renders <Script src={scriptSrc} ...> when shouldRender. */
  scriptSrc: string;
};

/**
 * Manages a Cloudflare Turnstile invisible widget. Use for anonymous-user
 * surfaces that need bot protection before hitting an LLM-backed endpoint.
 *
 * The hook only does work when `enabled` AND a site key is configured. When
 * either is false, `ready` defaults to true so the caller's send-path doesn't
 * stall — the server-side `checkAnonGate` is the single source of truth on
 * whether a token is required (it skips Turnstile when no secret is set).
 *
 * Caller responsibilities:
 *  - Render `<Script src={scriptSrc} onLoad={onScriptLoad}>` and the hidden
 *    container `<div ref={containerRef} />` only when `shouldRender` is true.
 *  - Read `tokenRef.current` at send time and include it in the request body.
 *  - Call `resetAfterSend()` after each request — tokens are single-use.
 */
// Set NEXT_PUBLIC_DEBUG_TURNSTILE=1 to enable verbose console logs covering
// the widget lifecycle and token transitions. Strip back to false once the
// in-book quick-mode anon flow is stable.
const TURNSTILE_DEBUG =
  process.env.NEXT_PUBLIC_DEBUG_TURNSTILE === "1" ||
  process.env.NODE_ENV !== "production";

function tlog(...args: unknown[]) {
  if (TURNSTILE_DEBUG) console.log("[turnstile]", ...args);
}

export function useTurnstile(enabled: boolean): UseTurnstileResult {
  const tokenRef = useRef<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldRender = enabled && Boolean(TURNSTILE_SITE_KEY);
  const [ready, setReady] = useState(!shouldRender);

  // Stable instance id to disambiguate logs from concurrent hook instances.
  const instanceIdRef = useRef<string>(
    typeof window === "undefined" ? "ssr" : `t${Math.random().toString(36).slice(2, 8)}`
  );

  tlog(instanceIdRef.current, "render", {
    enabled,
    shouldRender,
    ready,
    hasToken: !!tokenRef.current,
    widgetId: widgetIdRef.current,
  });

  const onScriptLoad = useCallback(() => {
    tlog(instanceIdRef.current, "onScriptLoad called", {
      shouldRender,
      hasWindowTurnstile:
        typeof window !== "undefined" && !!window.turnstile,
      hasContainer: !!containerRef.current,
      existingWidgetId: widgetIdRef.current,
    });
    if (!shouldRender || !window.turnstile || !containerRef.current) {
      tlog(instanceIdRef.current, "onScriptLoad early-return");
      return;
    }
    if (widgetIdRef.current) {
      tlog(instanceIdRef.current, "onScriptLoad skipped (widget already rendered)");
      return;
    }
    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY!,
        size: "invisible",
        appearance: "interaction-only",
        callback: (token) => {
          tlog(instanceIdRef.current, "widget callback (token received)", {
            tokenPrefix: token.slice(0, 16),
          });
          tokenRef.current = token;
          setReady(true);
        },
        "error-callback": () => {
          tlog(instanceIdRef.current, "widget error-callback");
          tokenRef.current = null;
          setReady(false);
        },
        "expired-callback": () => {
          tlog(instanceIdRef.current, "widget expired-callback");
          tokenRef.current = null;
          setReady(false);
          if (widgetIdRef.current && window.turnstile) {
            window.turnstile.reset(widgetIdRef.current);
          }
        },
      });
      tlog(instanceIdRef.current, "widget rendered", {
        widgetId: widgetIdRef.current,
      });
    } catch (err) {
      console.error("[turnstile] render failed:", err);
    }
  }, [shouldRender]);

  const resetAfterSend = useCallback(() => {
    tlog(instanceIdRef.current, "resetAfterSend", {
      widgetId: widgetIdRef.current,
      hasTurnstile: typeof window !== "undefined" && !!window.turnstile,
    });
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        /* noop */
      }
    }
    tokenRef.current = null;
    if (shouldRender) setReady(false);
  }, [shouldRender]);

  // Fallback render path. The `<Script onLoad>` callback only fires on the
  // first script load — when a *consumer* component unmounts and a new one
  // mounts, the script is already in the DOM and Next.js will not re-fire
  // onLoad for the new instance. Without this effect, the second consumer
  // would never get its widget rendered, so no token, so any submit that
  // happens while waiting for a token would hang in `pending` forever.
  useEffect(() => {
    if (!shouldRender) return;
    if (typeof window === "undefined") return;
    tlog(instanceIdRef.current, "fallback effect", {
      hasWindowTurnstile: !!window.turnstile,
      widgetId: widgetIdRef.current,
    });
    if (window.turnstile) {
      onScriptLoad();
    }
  }, [shouldRender, onScriptLoad]);

  useEffect(() => {
    const id = instanceIdRef.current;
    return () => {
      tlog(id, "cleanup unmounting", {
        widgetId: widgetIdRef.current,
        hasTurnstile: typeof window !== "undefined" && !!window.turnstile,
      });
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* noop */
        }
      }
      // Critical: clear refs after removing the widget. Without this, a
      // subsequent mount of the *same* hook instance (React StrictMode dev
      // double-invokes mount → cleanup → remount) would see widgetIdRef still
      // pointing at the now-destroyed widget, hit the early-return in
      // onScriptLoad, and never render a replacement. The fallback effect
      // would call onScriptLoad, log "widget already rendered", and skip —
      // leaving the consumer waiting on a token that's never coming.
      widgetIdRef.current = null;
      tokenRef.current = null;
    };
  }, []);

  return {
    ready,
    tokenRef,
    containerRef,
    onScriptLoad,
    resetAfterSend,
    shouldRender,
    scriptSrc:
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  };
}
