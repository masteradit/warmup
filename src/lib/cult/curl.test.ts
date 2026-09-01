import { describe, it, expect } from "vitest";
import { parseCurl, sessionFromCurl } from "./curl";

const SAMPLE = `curl 'https://www.cult.fit/api/cult/classes/v2?productType=FITNESS' \\
  -H 'accept: application/json' \\
  -H 'apikey: 9d153009-e961-4718-a343-2a36b0a1d1fd' \\
  -H 'appversion: 7' \\
  -b 'deviceId=abc-123; at=CFAPP%3Auuid-at; st=CFAPP%3Auuid-st; _ga=GA1.2.x'`;

describe("parseCurl", () => {
  it("extracts headers and the -b cookie string", () => {
    const { headers, cookies } = parseCurl(SAMPLE);
    expect(headers.apikey).toBe("9d153009-e961-4718-a343-2a36b0a1d1fd");
    expect(headers.appversion).toBe("7");
    expect(cookies).toContain("at=CFAPP%3Auuid-at");
  });

  it("falls back to a cookie: header when there is no -b flag", () => {
    const curl = `curl 'https://www.cult.fit/api/x' -H 'cookie: at=xyz; st=abc'`;
    expect(parseCurl(curl).cookies).toBe("at=xyz; st=abc");
  });

  it("is safe on junk input", () => {
    expect(parseCurl("")).toEqual({ headers: {}, cookies: "" });
    // @ts-expect-error deliberately wrong type
    expect(parseCurl(null)).toEqual({ headers: {}, cookies: "" });
  });
});

describe("sessionFromCurl", () => {
  it("builds a session with at/st/deviceId from a valid command", () => {
    const { session, error } = sessionFromCurl(SAMPLE);
    expect(error).toBeUndefined();
    expect(session).toMatchObject({
      at: "CFAPP%3Auuid-at",
      st: "CFAPP%3Auuid-st",
      deviceId: "abc-123",
    });
    expect(session?.cookie).toContain("at=CFAPP%3Auuid-at");
  });

  it("reads the cookie from a next.cult.fit document request (Cookie header, no -b)", () => {
    // The current onboarding flow: "Copy as cURL" on the top document request.
    // Chrome emits the session as a `-H 'Cookie: ...'` header, not a `-b` flag.
    const curl = `curl 'https://next.cult.fit/home' \\
  -H 'accept: text/html' \\
  -H 'Cookie: deviceId=dev-9; at=CFAPP%3Adoc-at; st=CFAPP%3Adoc-st; _ga=GA1.2.x'`;
    const { session, error } = sessionFromCurl(curl);
    expect(error).toBeUndefined();
    expect(session).toMatchObject({
      at: "CFAPP%3Adoc-at",
      st: "CFAPP%3Adoc-st",
      deviceId: "dev-9",
    });
  });

  it("rejects a command with no cookies", () => {
    const { session, error } = sessionFromCurl("curl 'https://www.cult.fit/api/x'");
    expect(session).toBeNull();
    expect(error).toMatch(/no cookies/i);
  });

  it("accepts a request with only a signed `nextjanus_at` cookie (no bare `at`)", () => {
    const curl =
      "curl 'https://next.cult.fit/home' -H 'cookie: nextjanus_at=s%3ACFAPP%3Auuid.sig; nextjanus_st=s%3ACFAPP%3Auuid2.sig2; deviceId=dev-1'";
    const { session, error } = sessionFromCurl(curl);
    expect(error).toBeUndefined();
    expect(session?.cookie).toContain("nextjanus_at=s%3ACFAPP%3Auuid.sig");
    expect(session?.at).toBeUndefined();
    expect(session?.deviceId).toBe("dev-1");
  });

  it("rejects a cookie string with no session token (`at` or `nextjanus_at`)", () => {
    const { session, error } = sessionFromCurl(
      "curl 'https://next.cult.fit/api/x' -b '_ga=GA1.2.x; _gid=y'",
    );
    expect(session).toBeNull();
    expect(error).toMatch(/at.*nextjanus_at/i);
  });
});
