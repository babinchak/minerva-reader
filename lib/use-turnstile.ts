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
export function useTurnstile(enabled: boolean): UseTurnstileResult {
  const tokenRef = useRef<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldRender = enabled && Boolean(TURNSTILE_SITE_KEY);
  const [ready, setReady] = useState(!shouldRender);

  const onScriptLoad = useCallback(() => {
    if (!shouldRender || !window.turnstile || !containerRef.current) return;
    if (widgetIdRef.current) return;
    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY!,
        size: "invisible",
        appearance: "interaction-only",
        callback: (token) => {
          tokenRef.current = token;
          setReady(true);
        },
        "error-callback": () => {
          tokenRef.current = null;
          setReady(false);
        },
        "expired-callback": () => {
          tokenRef.current = null;
          setReady(false);
          if (widgetIdRef.current && window.turnstile) {
            window.turnstile.reset(widgetIdRef.current);
          }
        },
      });
    } catch (err) {
      console.error("[turnstile] render failed:", err);
    }
  }, [shouldRender]);

  const resetAfterSend = useCallback(() => {
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
    if (window.turnstile) {
      onScriptLoad();
    }
  }, [shouldRender, onScriptLoad]);

  useEffect(() => {
    return () => {
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
      // onScriptLoad, and never render a replacement.
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
