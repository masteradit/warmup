import { describe, it, expect, vi, afterEach } from "vitest";
import { cultRequest } from "./client";

/**
 * The next.cult.fit gateway 401s ("Login Required") on any request that carries
 * a bare `at`/`st` header, even when a valid signed `nextjanus_at` cookie is
 * present. So for paste sessions (which have a raw `cookie` string) the proxy
 * must forward ONLY that cookie, with no token-derived headers.
 */

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ ok: true }),
    text: async () => "{}",
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

describe("cultRequest session headers", () => {
  it("forwards a paste session's cookie verbatim and sends no bare at/st headers", async () => {
    const fetchMock = stubFetch();
    await cultRequest("/api/cult/centers", {
      session: {
        cookie: "at=RAW; nextjanus_at=s%3ARAW.sig; deviceId=dev-1",
        at: "RAW",
        st: "RAW-ST",
        deviceId: "dev-1",
      },
      maxRetries: 0,
    });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers["Cookie"]).toBe("at=RAW; nextjanus_at=s%3ARAW.sig; deviceId=dev-1");
    expect(headers["at"]).toBeUndefined();
    expect(headers["st"]).toBeUndefined();
    expect(headers["deviceId"]).toBeUndefined();
    // static headers still go out
    expect(headers["apikey"]).toBeTruthy();
  });

  it("still sends token headers + synthesized cookie for an OTP session (no cookie string)", async () => {
    const fetchMock = stubFetch();
    await cultRequest("/api/cult/centers", {
      session: { at: "AT", st: "ST", deviceId: "DEV" },
      maxRetries: 0,
    });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers["at"]).toBe("AT");
    expect(headers["st"]).toBe("ST");
    expect(headers["Cookie"]).toBe("at=AT; st=ST; deviceId=DEV");
  });
});
