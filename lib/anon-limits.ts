/**
 * Anonymous query gating: per-IP daily rate limit, global daily budget cap,
 * Cloudflare Turnstile verification.
 *
 * The budget cap is the absolute safety net. Even if Turnstile and the IP
 * limit are bypassed, the gate snaps shut once today's anon spend exceeds
 * ANON_DAILY_BUDGET_DOLLARS.
 */

import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

export const ANON_DAILY_REQUESTS_PER_IP =
  Number(process.env.ANON_DAILY_REQUESTS_PER_IP) || 3;

export const ANON_DAILY_BUDGET_DOLLARS =
  Number(process.env.ANON_DAILY_BUDGET_DOLLARS) || 5;

/** When set to "0" or "false", anon queries are hard-disabled (kill switch). */
export function anonQueriesEnabled(): boolean {
  const v = process.env.ANON_QUERIES_ENABLED;
  if (!v) return true;
  return v !== "0" && v.toLowerCase() !== "false";
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return "unknown";
}

export function hashIp(ip: string): string {
  const salt = process.env.ANON_IP_SALT || "minerva-anon-default-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfTomorrowUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // Not configured: skip (dev / pre-launch).
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          remoteip: ip,
        }),
      }
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("[anon-limits] Turnstile verify failed:", err);
    return false;
  }
}

export type AnonGateDenial = {
  allowed: false;
  reason:
    | "disabled"
    | "turnstile_missing"
    | "turnstile_failed"
    | "rate_limit"
    | "budget_cap";
  resetAt?: string;
  message: string;
};

export type AnonGateAllow = {
  allowed: true;
  ipHash: string;
  remaining: number;
};

export type AnonGateResult = AnonGateAllow | AnonGateDenial;

/**
 * Run the full anon gate: kill switch, Turnstile, budget cap, IP rate limit.
 * Increments the IP counter on success. Increment is atomic (DB-side).
 */
export async function checkAnonGate(
  req: Request,
  turnstileToken: string | null
): Promise<AnonGateResult> {
  if (!anonQueriesEnabled()) {
    return {
      allowed: false,
      reason: "disabled",
      message: "Sign up free to ask questions across the library.",
    };
  }

  const ip = getClientIp(req);

  // Turnstile required only when secret is set; verifyTurnstile returns true
  // when no secret (so dev / pre-deploy skips automatically).
  if (process.env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return {
        allowed: false,
        reason: "turnstile_missing",
        message: "Please complete the verification challenge.",
      };
    }
    const ok = await verifyTurnstile(turnstileToken, ip);
    if (!ok) {
      return {
        allowed: false,
        reason: "turnstile_failed",
        message: "Verification failed. Please try again.",
      };
    }
  }

  const supabase = createServiceClient();
  const today = todayUtcDate();

  // Budget cap (global) — sum today's anon spend from usage_records.
  const { data: spendRow, error: spendErr } = await supabase.rpc(
    "get_anon_daily_spend",
    { p_day: today }
  );
  if (spendErr) {
    console.error("[anon-limits] get_anon_daily_spend failed:", spendErr);
    // Fail closed on errors — better to block than surprise-bill.
    return {
      allowed: false,
      reason: "budget_cap",
      message: "Free queries are temporarily unavailable. Please sign up.",
    };
  }
  const spent = Number(spendRow ?? 0);
  if (spent >= ANON_DAILY_BUDGET_DOLLARS) {
    return {
      allowed: false,
      reason: "budget_cap",
      resetAt: startOfTomorrowUtc(),
      message: "Daily free-query budget reached. Sign up to keep asking.",
    };
  }

  // Per-IP rate limit (atomic check + increment).
  const ipHash = hashIp(ip);
  const { data: rateRow, error: rateErr } = await supabase.rpc(
    "check_and_increment_anon_request",
    {
      p_ip_hash: ipHash,
      p_day: today,
      p_limit: ANON_DAILY_REQUESTS_PER_IP,
    }
  );
  if (rateErr) {
    console.error("[anon-limits] rate-limit RPC failed:", rateErr);
    return {
      allowed: false,
      reason: "rate_limit",
      message: "Free queries are temporarily unavailable. Please sign up.",
    };
  }
  const row = Array.isArray(rateRow) ? rateRow[0] : rateRow;
  const newCount = Number(row?.new_count ?? 0);
  const allowed = Boolean(row?.allowed);

  if (!allowed) {
    return {
      allowed: false,
      reason: "rate_limit",
      resetAt: startOfTomorrowUtc(),
      message: `You've used your ${ANON_DAILY_REQUESTS_PER_IP} free queries for today. Sign up free to keep asking.`,
    };
  }

  return {
    allowed: true,
    ipHash,
    remaining: Math.max(0, ANON_DAILY_REQUESTS_PER_IP - newCount),
  };
}
