"use client";

import { useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { sessionFromCurl } from "@/lib/cult/curl";
import { getSchedule } from "@/lib/cult/api";
import { sessionStore, type StoredSession } from "@/lib/storage";

/**
 * Fallback onboarding: paste a "Copy as cURL" request captured from a logged-in
 * cult.fit tab. We parse out the `at`/`st` cookies, verify them with one live
 * schedule call, then store. Nothing is sent anywhere but our own proxy.
 */
export function CurlFlow({
  onConnected,
}: {
  onConnected: (s: StoredSession) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    const { session, error: parseError } = sessionFromCurl(text);
    if (!session) return setError(parseError ?? "Could not read that command.");

    const candidate: StoredSession = {
      session,
      method: "curl",
      connectedAt: Date.now(),
    };
    setBusy(true);
    // Temporarily store so getSchedule() picks it up, then validate.
    const previous = sessionStore.get();
    sessionStore.set(candidate);
    try {
      await getSchedule();
      onConnected(candidate);
    } catch {
      if (previous) sessionStore.set(previous);
      else sessionStore.clear();
      setError(
        "That session didn't work. Make sure you copied a recent request while logged in to next.cult.fit, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ol className="text-sm text-muted space-y-1 list-decimal list-inside">
        <li>Open <span className="text-fg">next.cult.fit</span> in a desktop browser and log in.</li>
        <li>Open DevTools → Network, then reload the page.</li>
        <li>Click the <span className="text-fg">first request</span> in the list (the page itself, <code className="text-fg">home</code>).</li>
        <li>Right-click → Copy → <span className="text-fg">Copy as cURL</span>, and paste below.</li>
      </ol>
      <Textarea
        rows={6}
        placeholder="curl 'https://next.cult.fit/home' -H '...' -b 'at=...; st=...'"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button size="lg" loading={busy} onClick={connect}>
        Connect
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">
        We keep only the session tokens, in this browser&apos;s storage. The rest
        of the command is discarded.
      </p>
    </div>
  );
}
