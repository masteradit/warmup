/**
 * Low-level HTTP client for the Cult.fit API, with retry + exponential backoff.
 * Ported from cultbot/src/api-client.js.
 *
 * This runs SERVER-SIDE ONLY (inside the proxy route handler). The browser never
 * imports it — it would be blocked by CORS anyway. See src/lib/cult/api.ts for
 * the browser-side helpers that call our own /api/cult proxy.
 */

import { CULT_API_BASE, CULT_STATIC_HEADERS, RETRYABLE_STATUS } from "./constants";

/** Build the `centerId=` query. MUST be a single comma-joined, unencoded value —
 * a repeated param makes the API 500, and one unknown id fails the whole call. */
export function classesPath(centerIds?: number[]): string {
  const ids = [...new Set(centerIds ?? [])].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  const query = ids.length > 0 ? `&centerId=${ids.join(",")}` : "";
  return `/api/cult/classes/v2?productType=FITNESS${query}`;
}

export const bookPath = (classId: string | number) =>
  `/api/cult/class/${classId}/book`;
export const cancelPath = (classId: string | number) =>
  `/api/cult/class/${classId}/cancel`;
export const centersPath = () => `/api/cult/centers`;
export const citiesPath = () => `/api/user/cities/v2`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class CultApiError extends Error {
  status: number;
  fatal: boolean;
  body: string;
  constructor(status: number, statusText: string, body: string, fatal: boolean) {
    super(`HTTP ${status} ${statusText} ${body}`.trim());
    this.name = "CultApiError";
    this.status = status;
    this.fatal = fatal;
    this.body = body;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** The user's Cult session — a raw Cookie string, or `at`/`st` token values. */
  session: CultSession;
  maxRetries?: number;
  retryDelay?: number;
  /** AbortSignal for timeouts. */
  signal?: AbortSignal;
}

/** A user's Cult session, however it was obtained. */
export interface CultSession {
  /** Full `Cookie:` header string (from paste onboarding). */
  cookie?: string;
  /** `at` token value (from OTP login), sent as both header and cookie. */
  at?: string;
  /** `st` token value (from OTP login). */
  st?: string;
  /** Optional device id captured at login. */
  deviceId?: string;
}

function sessionHeaders(s: CultSession): Record<string, string> {
  const h: Record<string, string> = {};
  const cookieParts: string[] = [];
  if (s.cookie) cookieParts.push(s.cookie);
  if (s.at) {
    h["at"] = s.at;
    cookieParts.push(`at=${s.at}`);
  }
  if (s.st) {
    h["st"] = s.st;
    cookieParts.push(`st=${s.st}`);
  }
  if (s.deviceId) {
    h["deviceId"] = s.deviceId;
    cookieParts.push(`deviceId=${s.deviceId}`);
  }
  if (cookieParts.length) h["Cookie"] = cookieParts.join("; ");
  return h;
}

/**
 * Make one Cult API request against CULT_API_BASE, retrying transient failures.
 * 401/403/404 throw immediately with `fatal: true` so the caller can surface a
 * "reconnect your Cult account" prompt instead of hammering the API.
 */
export async function cultRequest<T = unknown>(
  path: string,
  {
    method = "GET",
    body,
    session,
    maxRetries = 3,
    retryDelay = 800,
    signal,
  }: RequestOptions,
): Promise<T> {
  const url = `${CULT_API_BASE}${path}`;
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    ...CULT_STATIC_HEADERS,
    ...sessionHeaders(session),
  };
  const init: RequestInit = { method, headers, signal, cache: "no-store" };
  if (body !== undefined) init.body = JSON.stringify(body);

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const retryable =
          RETRYABLE_STATUS.has(res.status) && attempt <= maxRetries;
        throw new CultApiError(res.status, res.statusText, text, !retryable);
      }
      const ct = res.headers.get("content-type") || "";
      return (ct.includes("application/json")
        ? await res.json()
        : await res.text()) as T;
    } catch (err) {
      lastError = err;
      if (err instanceof CultApiError && err.fatal) break;
      if (attempt > maxRetries) break;
      await sleep(retryDelay * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}
