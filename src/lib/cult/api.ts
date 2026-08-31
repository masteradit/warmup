/**
 * Browser-side helpers. These call OUR proxy at /api/cult/* (never cult.fit
 * directly — CORS forbids it), attaching the stored session as the
 * X-Cult-Session header. The session value never leaves the device except to
 * our own same-origin proxy, which forwards it upstream and stores nothing.
 */

"use client";

import { sessionStore } from "../storage";
import { classesPath, bookPath, cancelPath, centersPath, citiesPath } from "./client";
import type {
  CenterDirectoryEntry,
  CitiesResponse,
  ScheduleResponse,
} from "./types";

export class ProxyError extends Error {
  code: string;
  status: number;
  detail?: unknown;
  constructor(code: string, status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "ProxyError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
  get sessionExpired() {
    return this.code === "session_expired" || this.status === 401;
  }
}

function toProxyUrl(cultApiPath: string): string {
  // Cult paths ("/api/cult/classes/v2", "/api/user/cities/v2", "/api/auth/…")
  // are rehomed under our catch-all proxy route at /api/cult/[...path], so
  // "/api/user/cities/v2" -> "/api/cult/user/cities/v2". The proxy's allowlist
  // matches on the segments after that prefix.
  return cultApiPath.replace(/^\/api\//, "/api/cult/");
}

async function call<T>(
  cultApiPath: string,
  init: { method?: "GET" | "POST"; body?: unknown; requireSession?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, requireSession = true } = init;
  const headers: Record<string, string> = {};
  if (method === "POST") headers["content-type"] = "application/json";

  const stored = sessionStore.get();
  if (requireSession) {
    if (!stored) throw new ProxyError("no_session", 401, "Connect your Cult.fit account first.");
    headers["x-cult-session"] = JSON.stringify(stored.session);
  }

  const res = await fetch(toProxyUrl(cultApiPath), {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ProxyError(
      (data as { error?: string }).error ?? "proxy_error",
      res.status,
      (data as { message?: string }).message ?? `Request failed (${res.status}).`,
      (data as { detail?: unknown }).detail,
    );
  }
  return data as T;
}

/* ------------------------------ endpoints ------------------------------ */

export function getSchedule(centerIds?: number[]): Promise<ScheduleResponse> {
  return call<ScheduleResponse>(classesPath(centerIds));
}

export function getCenters(): Promise<CenterDirectoryEntry[]> {
  return call<CenterDirectoryEntry[]>(centersPath());
}

export function getCities(): Promise<CitiesResponse> {
  return call<CitiesResponse>(citiesPath());
}

/** Book (or join the waitlist for) a class. Cult uses the same call for both. */
export function bookClass(classId: string): Promise<unknown> {
  return call(bookPath(classId), { method: "POST", body: {} });
}

/** Provisional — the cancel endpoint is confirmed in Phase 5. */
export function cancelClass(classId: string): Promise<unknown> {
  return call(cancelPath(classId), { method: "POST", body: {} });
}

/* -------------------------------- auth -------------------------------- */

export function sendOtp(payload: {
  phone: string;
  countryCallingCode: string;
  captchaResponse: string;
}): Promise<unknown> {
  return call("/api/auth/loginPhoneSendOtp", {
    method: "POST",
    body: payload,
    requireSession: false,
  });
}

export function verifyOtp(payload: {
  phone: string;
  countryCallingCode: string;
  otp: string;
  captchaResponse: string;
  deviceInfo: Record<string, unknown>;
}): Promise<unknown> {
  return call("/api/auth/loginPhoneVerifyOtp", {
    method: "POST",
    body: payload,
    requireSession: false,
  });
}
