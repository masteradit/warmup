"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SITE_KEY =
  process.env.NEXT_PUBLIC_CULT_RECAPTCHA_SITE_KEY ||
  "6LeggMUhAAAAAGLD3itX--L4Ht7PGzzKl4tNnVkR";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

type Status = "loading" | "ready" | "error";

/**
 * Cult.fit's site key is reCAPTCHA **v3** — invisible, no checkbox. We load
 * Google's script with `?render=<siteKey>` and mint a fresh token with
 * `grecaptcha.execute(...)` immediately before each sendOtp / verifyOtp call
 * (v3 tokens expire in ~2 minutes).
 *
 * Whether Cult's backend accepts a token minted from this origin depends on the
 * domains registered against their key. If it rejects them, `execute()` still
 * resolves but Cult returns "captcha is invalid" — the OTP screen surfaces that
 * and points the user at the paste method.
 */
export function useRecaptcha() {
  const [status, setStatus] = useState<Status>("loading");
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    if (window.grecaptcha?.execute) {
      setStatus("ready");
      return;
    }
    const existing = document.getElementById("recaptcha-v3");
    if (!existing) {
      const s = document.createElement("script");
      s.id = "recaptcha-v3";
      s.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
      s.async = true;
      s.onerror = () => setStatus("error");
      document.head.appendChild(s);
    }
    const poll = setInterval(() => {
      if (window.grecaptcha?.execute) {
        clearInterval(poll);
        setStatus("ready");
      }
    }, 200);
    const giveUp = setTimeout(() => {
      clearInterval(poll);
      setStatus((s) => (s === "ready" ? s : "error"));
    }, 10_000);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, []);

  const execute = useCallback(
    (action: string): Promise<string> =>
      new Promise((resolve, reject) => {
        const g = window.grecaptcha;
        if (!g?.execute) return reject(new Error("reCAPTCHA not ready"));
        g.ready(() => {
          g.execute(SITE_KEY, { action }).then(resolve, reject);
        });
      }),
    [],
  );

  return { status, execute };
}

/** The badge disclosure Google's terms require when using v3 invisibly. */
export function RecaptchaNotice() {
  return (
    <p className="text-[11px] text-muted">
      Protected by reCAPTCHA — Google&apos;s{" "}
      <a className="underline" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
        Privacy Policy
      </a>{" "}
      and{" "}
      <a className="underline" href="https://policies.google.com/terms" target="_blank" rel="noreferrer">
        Terms
      </a>{" "}
      apply.
    </p>
  );
}
