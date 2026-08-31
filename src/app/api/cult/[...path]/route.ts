/**
 * The Cult.fit proxy. This is the ONLY server-side component with a network
 * dependency, and the single choke point for every Cult API call the app makes.
 *
 * Design:
 *   - Stateless. The user's Cult session arrives in the `X-Cult-Session` request
 *     header (JSON), is forwarded to Cult, and is never stored or logged.
 *   - Because the session is a custom header, not a cookie, the proxy is immune
 *     to CSRF.
 *   - Path allowlist (PROXY_ALLOWLIST) — anything else is 403, so this can never
 *     become an open relay for the whole Cult API.
 *   - Best-effort in-memory per-IP rate limiting, since this runs on a public
 *     free-tier deployment.
 */

import { NextRequest, NextResponse } from "next/server";
import { PROXY_ALLOWLIST } from "@/lib/cult/constants";
import { cultRequest, CultApiError, type CultSession } from "@/lib/cult/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = Number(process.env.PROXY_RATE_LIMIT_PER_MINUTE || 60);
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function parseSession(req: NextRequest): CultSession | null {
  const raw = req.headers.get("x-cult-session");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CultSession;
    if (!parsed || (!parsed.cookie && !parsed.at)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function resolvePath(segments: string[], search: string): string | null {
  const joined = segments.join("/");
  const allowed = PROXY_ALLOWLIST.some((re) => re.test(joined));
  if (!allowed) return null;
  return `/api/${joined}${search}`;
}

async function handle(
  req: NextRequest,
  segments: string[],
  method: "GET" | "POST",
): Promise<NextResponse> {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Slow down a moment." },
      { status: 429 },
    );
  }

  const upstreamPath = resolvePath(
    segments,
    new URL(req.url).search,
  );
  if (!upstreamPath) {
    return NextResponse.json(
      { error: "not_allowed", message: "That Cult endpoint is not proxied." },
      { status: 403 },
    );
  }

  // `auth/*` endpoints don't need a session; everything else does.
  const isAuth = segments[0] === "auth";
  const session = parseSession(req);
  if (!isAuth && !session) {
    return NextResponse.json(
      { error: "no_session", message: "Connect your Cult.fit account first." },
      { status: 401 },
    );
  }

  let body: unknown;
  if (method === "POST") {
    body = await req.json().catch(() => ({}));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const data = await cultRequest(upstreamPath, {
      method,
      body: method === "POST" ? body ?? {} : undefined,
      // For auth calls with no user session, send an empty session object.
      session: session ?? ({} as CultSession),
      signal: controller.signal,
    });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof CultApiError) {
      const expired = err.status === 401 || err.status === 403;
      return NextResponse.json(
        {
          error: expired ? "session_expired" : "cult_error",
          status: err.status,
          message: expired
            ? "Your Cult.fit session has expired. Reconnect to continue."
            : `Cult.fit returned ${err.status}.`,
          // Pass through Cult's own message body when it is short JSON.
          detail: safeDetail(err.body),
        },
        { status: expired ? 401 : 502 },
      );
    }
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        error: aborted ? "timeout" : "proxy_error",
        message: aborted
          ? "Cult.fit took too long to respond."
          : "Could not reach Cult.fit.",
      },
      { status: 504 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function safeDetail(body: string): unknown {
  if (!body || body.length > 500) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path, "GET");
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path, "POST");
}
