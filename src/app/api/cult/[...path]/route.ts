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
import { PROXY_ALLOWLIST, CULT_API_BASE, CULT_STATIC_HEADERS } from "@/lib/cult/constants";
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
  // Cult's API 500s on a percent-encoded comma in `centerId=` — it must stay a
  // literal comma. Commas only ever appear as list separators in these queries.
  return `/api/${joined}${search.replace(/%2C/gi, ",")}`;
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
  const isVerifyOtp = segments.join("/") === "auth/loginPhoneVerifyOtp";
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

  // verifyOtp is the one call where the session is CREATED. Cult returns it as
  // Set-Cookie headers, which the stateless proxy cannot persist. So we make
  // this request by hand, read the `at`/`st` cookies off the response, and hand
  // them back to the client in the JSON body as `__session` — the client stores
  // that in localStorage and replays it via X-Cult-Session on every later call.
  if (isVerifyOtp) {
    return handleVerifyOtp(upstreamPath, body);
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

async function handleVerifyOtp(
  upstreamPath: string,
  body: unknown,
): Promise<NextResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${CULT_API_BASE}${upstreamPath}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...CULT_STATIC_HEADERS,
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    const data = text ? safeParse(text) : {};
    if (!res.ok) {
      return NextResponse.json(
        {
          error: "otp_failed",
          status: res.status,
          message: "Cult.fit rejected the OTP.",
          detail: safeDetail(text),
        },
        { status: 400 },
      );
    }

    const setCookies = readSetCookies(res);
    const at = pickCookie(setCookies, "at");
    const st = pickCookie(setCookies, "st");
    const deviceId = pickCookie(setCookies, "deviceId");

    return NextResponse.json({
      ...(data as object),
      __session:
        at || st
          ? { at, st, deviceId }
          : // Cult didn't send tokens we can read — the OTP flow won't work on
            // this deployment; the client should fall back to paste onboarding.
            null,
    });
  } catch {
    return NextResponse.json(
      { error: "proxy_error", message: "Could not reach Cult.fit for verification." },
      { status: 504 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function readSetCookies(res: Response): string[] {
  // Node 18+ / undici exposes getSetCookie(); fall back to a single header.
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

function pickCookie(setCookies: string[], name: string): string | undefined {
  for (const c of setCookies) {
    const m = new RegExp(`(?:^|,\\s*)${name}=([^;]+)`).exec(c);
    if (m) return decodeURIComponent(m[1]);
  }
  return undefined;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
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
