"use client";

import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_CULT_CAPTCHA_SITE_KEY ||
  process.env.NEXT_PUBLIC_CULT_RECAPTCHA_SITE_KEY ||
  "6LeggMUhAAAAAGLD3itX--L4Ht7PGzzKl4tNnVkR";

declare global {
  interface Window {
    grecaptcha?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => number;
      reset: (id?: number) => void;
    };
    __warmupOnRecaptcha?: () => void;
  }
}

/**
 * Cult.fit's own reCAPTCHA v2 checkbox, rendered with their public site key
 * (scraped from cult.fit's login page). The user solves a real Google captcha —
 * nothing here bypasses it. The resulting token is sent to Cult's sendOtp /
 * verifyOtp endpoints through our proxy. If Cult ever domain-locks the key this
 * widget will error and onboarding falls back to the paste flow.
 */
export function Recaptcha({
  onToken,
  onExpire,
}: {
  onToken: (token: string) => void;
  onExpire: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    function tryRender() {
      if (cancelled) return;
      if (!window.grecaptcha || !ref.current || widgetId.current !== null) return;
      try {
        widgetId.current = window.grecaptcha.render(ref.current, {
          sitekey: SITE_KEY,
          callback: (token: string) => onToken(token),
          "expired-callback": () => onExpire(),
          "error-callback": () => setStatus("error"),
        });
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }

    if (window.grecaptcha) {
      tryRender();
    } else {
      const existing = document.getElementById("recaptcha-api");
      if (!existing) {
        const s = document.createElement("script");
        s.id = "recaptcha-api";
        s.src = "https://www.google.com/recaptcha/api.js?render=explicit";
        s.async = true;
        s.defer = true;
        s.onerror = () => setStatus("error");
        document.head.appendChild(s);
      }
      const poll = setInterval(() => {
        if (window.grecaptcha) {
          clearInterval(poll);
          tryRender();
        }
      }, 200);
      const giveUp = setTimeout(() => {
        clearInterval(poll);
        if (widgetId.current === null) setStatus("error");
      }, 10_000);
      return () => {
        cancelled = true;
        clearInterval(poll);
        clearTimeout(giveUp);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [onToken, onExpire]);

  return (
    <div>
      <div ref={ref} className="min-h-[78px]" />
      {status === "loading" && (
        <p className="text-xs text-muted">Loading verification…</p>
      )}
      {status === "error" && (
        <p className="text-xs text-danger">
          Couldn&apos;t load the verification widget. Use the paste method below
          instead.
        </p>
      )}
    </div>
  );
}

export function resetRecaptcha() {
  try {
    window.grecaptcha?.reset();
  } catch {
    /* ignore */
  }
}
