"use client";

import { useEffect } from "react";
import { DEFAULT_MOBILE_QUERY } from "@/lib/use-media-query";

type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

type MobileLogEntry = {
  level: ConsoleLevel;
  message: string;
  ts: string;
  href: string;
};

declare global {
  interface Window {
    __MINERVA_MOBILE_LOG_MIRROR_INSTALLED__?: boolean;
  }
}

const MOBILE_USER_AGENT_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

function isLikelyMobileDevice() {
  if (typeof window === "undefined") return false;
  const byMediaQuery = window.matchMedia?.(DEFAULT_MOBILE_QUERY).matches ?? false;
  const byUserAgent = MOBILE_USER_AGENT_RE.test(window.navigator.userAgent);
  return byMediaQuery || byUserAgent;
}

function toSafeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return value.toString();

  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, inner) => {
      if (typeof inner === "bigint") return inner.toString();
      if (typeof inner === "function") return `[Function ${inner.name || "anonymous"}]`;
      if (typeof inner === "symbol") return inner.toString();
      if (inner && typeof inner === "object") {
        const candidate = inner as object;
        if (seen.has(candidate)) return "[Circular]";
        seen.add(candidate);
      }
      return inner;
    });
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export function MobileConsoleMirror() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;
    if (!isLikelyMobileDevice()) return;
    if (window.__MINERVA_MOBILE_LOG_MIRROR_INSTALLED__) return;

    window.__MINERVA_MOBILE_LOG_MIRROR_INSTALLED__ = true;

    const levels: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];
    const originalConsole: Record<ConsoleLevel, (...args: unknown[]) => void> = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
    };

    const queue: MobileLogEntry[] = [];
    let sending = false;

    const flush = async () => {
      if (sending || queue.length === 0) return;
      sending = true;
      const batch = queue.splice(0, 40);
      try {
        await fetch("/api/dev/mobile-console", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            logs: batch,
            userAgent: window.navigator.userAgent,
          }),
          keepalive: true,
        });
      } catch {
        // Best-effort in development. If this fails, local console still works.
      } finally {
        sending = false;
      }
    };

    for (const level of levels) {
      console[level] = (...args: unknown[]) => {
        originalConsole[level](...args);
        queue.push({
          level,
          message: args.map(toSafeString).join(" "),
          ts: new Date().toISOString(),
          href: window.location.href,
        });
        // Flush quickly so server output is near-real-time while developing.
        void flush();
      };
    }

    const intervalId = window.setInterval(() => {
      void flush();
    }, 1000);

    const onPageHide = () => {
      if (queue.length === 0) return;
      const payload = JSON.stringify({
        logs: queue.splice(0, queue.length),
        userAgent: window.navigator.userAgent,
      });
      if ("sendBeacon" in navigator) {
        navigator.sendBeacon("/api/dev/mobile-console", payload);
        return;
      }
      void fetch("/api/dev/mobile-console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    };

    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.clearInterval(intervalId);
      for (const level of levels) {
        console[level] = originalConsole[level];
      }
      window.__MINERVA_MOBILE_LOG_MIRROR_INSTALLED__ = false;
    };
  }, []);

  return null;
}
