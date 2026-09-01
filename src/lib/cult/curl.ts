/**
 * Parse a raw `curl` command copied from browser DevTools ("Copy as cURL") into
 * a Cult session. Ported from cultbot/src/curl-parser.js.
 *
 * This is the fallback onboarding path (Phase 1 outcome B). It is deliberately
 * forgiving: it pulls every -H/--header and the -b/--cookie value regardless of
 * order or quote style.
 */

import type { CultSession } from "./client";

const HEADER_FLAG = /(?:-H|--header)\s+(['"])([\s\S]*?)\1/g;
const COOKIE_FLAG = /(?:-b|--cookie)\s+(['"])([\s\S]*?)\1/;

export interface ParsedCurl {
  headers: Record<string, string>;
  cookies: string;
}

export function parseCurl(curlString: string): ParsedCurl {
  if (!curlString || typeof curlString !== "string")
    return { headers: {}, cookies: "" };

  const headers: Record<string, string> = {};
  HEADER_FLAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEADER_FLAG.exec(curlString)) !== null) {
    const raw = m[2];
    const sep = raw.indexOf(":");
    if (sep === -1) continue;
    const name = raw.slice(0, sep).trim().toLowerCase();
    const value = raw.slice(sep + 1).trim();
    if (name) headers[name] = value;
  }

  let cookies = "";
  const cookieMatch = COOKIE_FLAG.exec(curlString);
  if (cookieMatch) cookies = cookieMatch[2].trim();
  if (!cookies && headers.cookie) cookies = headers.cookie;

  return { headers, cookies };
}

function readCookie(cookieString: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookieString);
  return m ? m[1] : undefined;
}

/**
 * Build a Cult session from a pasted curl command. Considered valid if the
 * cookie string carries a Cult session token: either the bare `at` cookie, or
 * next.cult.fit's signed `nextjanus_at` cookie (the one the new gateway
 * actually checks). The whole cookie string is kept and forwarded verbatim, so
 * a request that only has `nextjanus_at` still authenticates.
 */
export function sessionFromCurl(curlString: string): {
  session: CultSession | null;
  error?: string;
} {
  const { cookies } = parseCurl(curlString);
  if (!cookies)
    return {
      session: null,
      error:
        "No cookies found in that command. Make sure you copied a request to next.cult.fit while logged in.",
    };
  const at = readCookie(cookies, "at");
  const hasSignedSession = Boolean(readCookie(cookies, "nextjanus_at"));
  if (!at && !hasSignedSession)
    return {
      session: null,
      error:
        "That request has no Cult session cookie (`at` / `nextjanus_at`). Copy a request from a logged-in next.cult.fit tab instead.",
    };
  return {
    session: {
      cookie: cookies,
      at,
      st: readCookie(cookies, "st"),
      deviceId: readCookie(cookies, "deviceId"),
    },
  };
}
