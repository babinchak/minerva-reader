import { NextRequest, NextResponse } from "next/server";

type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

type MobileLogEntry = {
  level?: unknown;
  message?: unknown;
  ts?: unknown;
  href?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeLevel(value: unknown): ConsoleLevel {
  if (value === "info" || value === "warn" || value === "error" || value === "debug") {
    return value;
  }
  return "log";
}

function printLogLine(level: ConsoleLevel, line: string) {
  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "info":
      console.info(line);
      break;
    case "debug":
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await req.json()) as { logs?: unknown; userAgent?: unknown };
    const rawLogs = Array.isArray(body.logs) ? body.logs : [];
    const userAgent = asString(body.userAgent) || req.headers.get("user-agent") || "unknown";
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

    if (rawLogs.length === 0) {
      return NextResponse.json({ ok: true, received: 0 });
    }

    console.log(`[mobile-console] batch received count=${rawLogs.length} ip=${ip}`);
    console.log(`[mobile-console] ua=${userAgent}`);

    for (const raw of rawLogs) {
      const entry = (raw ?? {}) as MobileLogEntry;
      const level = normalizeLevel(entry.level);
      const ts = asString(entry.ts) || new Date().toISOString();
      const href = asString(entry.href) || "unknown-url";
      const message = asString(entry.message);
      printLogLine(level, `[mobile-console/${level}] ${ts} ${href} :: ${message}`);
    }

    return NextResponse.json({ ok: true, received: rawLogs.length });
  } catch (error) {
    console.error("[mobile-console] failed to process logs", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
