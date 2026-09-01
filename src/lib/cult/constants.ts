/**
 * Static configuration for talking to the Cult.fit API.
 *
 * These values were captured from cult.fit's own web client during planning.
 * `apikey` is the public web client key and is identical for every visitor,
 * logged in or not. Everything here can be overridden by env vars so the app
 * keeps working if Cult rotates a value.
 *
 * Cult migrated its website to `next.cult.fit` (the old `www.cult.fit` now
 * redirects there). The same JSON API is served from both hosts with identical
 * responses and the same `apikey` auth, so `https://www.cult.fit` remains a
 * valid `CULT_API_BASE` override if `next.cult.fit` ever misbehaves.
 */

export const CULT_API_BASE = process.env.CULT_API_BASE || "https://next.cult.fit";

/** Headers every Cult API request must carry, besides the user's session. */
export const CULT_STATIC_HEADERS: Record<string, string> = {
  apikey: process.env.CULT_API_KEY || "9d153009-e961-4718-a343-2a36b0a1d1fd",
  appversion: process.env.CULT_APP_VERSION || "7",
  osname: process.env.CULT_OS_NAME || "browser",
  browsername: process.env.CULT_BROWSER_NAME || "Web",
  timezone: process.env.CULT_TIMEZONE || "Asia/Kolkata",
};

/**
 * Upstream paths the proxy is allowed to forward. Anything not matching one of
 * these is rejected, so the proxy can never become an open relay for the whole
 * Cult API. Patterns are matched against the path after `/api/`.
 */
export const PROXY_ALLOWLIST: RegExp[] = [
  /^cult\/classes\/v2$/,
  /^cult\/class\/\d+\/book$/,
  /^cult\/class\/\d+\/cancel$/, // provisional — confirmed in Phase 5
  /^cult\/centers$/,
  /^user\/cities\/v2$/,
  /^user\/status$/,
  /^auth\/loginPhoneSendOtp$/,
  /^auth\/loginPhoneVerifyOtp$/,
];

/** HTTP statuses worth retrying with backoff. 401/403 are NOT here: an expired
 * session must fail fast so the UI can prompt a reconnect. */
export const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Class `state` values seen in real `classes/v2` responses.
 * - AVAILABLE / WAITLIST_AVAILABLE: bookable (the latter only if waitlist is on)
 * - SEAT_NOT_AVAILABLE / WAITLIST_FULL: not bookable
 * - BOOKED: the user already holds this seat (also flagged via `isBooked`)
 */
export const BOOKABLE_STATES = new Set(["AVAILABLE", "WAITLIST_AVAILABLE"]);
export const WAITLIST_STATE = "WAITLIST_AVAILABLE";
