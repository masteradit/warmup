"use client";

import { useCallback, useState } from "react";
import { Button, Input } from "@/components/ui";
import { Recaptcha, resetRecaptcha } from "./recaptcha";
import { sendOtp, verifyOtp, ProxyError } from "@/lib/cult/api";
import type { StoredSession } from "@/lib/storage";

/**
 * Phone + OTP login against Cult's own endpoints, proxied. This is the Phase 1
 * spike path: it only works if Cult's reCAPTCHA site key isn't domain-locked.
 * On any failure the UI nudges the user to the paste method.
 */
export function OtpFlow({
  onConnected,
}: {
  onConnected: (s: StoredSession) => void;
}) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [cc] = useState("+91");
  const [otp, setOtp] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSend = useCallback(async () => {
    if (!/^\d{10}$/.test(phone)) return setError("Enter a 10-digit mobile number.");
    if (!captcha) return setError("Complete the verification checkbox first.");
    setBusy(true);
    setError(null);
    try {
      await sendOtp({ phone, countryCallingCode: cc, captchaResponse: captcha });
      setStep("otp");
      setCaptcha(null);
      resetRecaptcha();
    } catch (e) {
      setError(describe(e));
      setCaptcha(null);
      resetRecaptcha();
    } finally {
      setBusy(false);
    }
  }, [phone, cc, captcha]);

  const doVerify = useCallback(async () => {
    if (!/^\d{4,6}$/.test(otp)) return setError("Enter the OTP you received.");
    if (!captcha) return setError("Complete the verification checkbox first.");
    setBusy(true);
    setError(null);
    try {
      // The proxy makes the verify call, reads Cult's Set-Cookie tokens, and
      // returns them to us as `__session` (see the proxy route). We store that
      // and replay it via X-Cult-Session from then on.
      const res = (await verifyOtp({
        phone,
        countryCallingCode: cc,
        otp,
        captchaResponse: captcha,
        deviceInfo: {
          appId: "web",
          brand: "browser",
          model: "browser",
          osName: "browser",
          osVersion: 5.1,
          pushNotificationToken: "na",
        },
      })) as { __session?: { at?: string; st?: string; deviceId?: string } | null };

      if (!res.__session || (!res.__session.at && !res.__session.st)) {
        setError(
          "Logged in, but Cult didn't return a session this deployment can read. Use the paste method below instead.",
        );
        return;
      }
      onConnected({
        session: res.__session,
        method: "otp",
        phone,
        connectedAt: Date.now(),
      });
    } catch (e) {
      setError(describe(e));
      setCaptcha(null);
      resetRecaptcha();
    } finally {
      setBusy(false);
    }
  }, [otp, phone, cc, captcha, onConnected]);

  return (
    <div className="space-y-4">
      {step === "phone" ? (
        <>
          <label className="block text-sm font-medium">Mobile number</label>
          <div className="flex gap-2">
            <span className="inline-flex h-11 items-center rounded-xl border border-app bg-surface-2 px-3 text-sm text-muted">
              {cc}
            </span>
            <Input
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>
          <Recaptcha onToken={setCaptcha} onExpire={() => setCaptcha(null)} />
          <Button size="lg" loading={busy} onClick={doSend}>
            Send OTP
          </Button>
        </>
      ) : (
        <>
          <label className="block text-sm font-medium">
            Enter the OTP sent to {cc} {maskPhone(phone)}
          </label>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <Recaptcha onToken={setCaptcha} onExpire={() => setCaptcha(null)} />
          <Button size="lg" loading={busy} onClick={doVerify}>
            Verify &amp; connect
          </Button>
          <button
            className="text-xs text-muted hover:text-fg"
            onClick={() => {
              setStep("phone");
              setOtp("");
              setError(null);
            }}
          >
            ← Change number
          </button>
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function describe(e: unknown): string {
  if (e instanceof ProxyError) {
    const detail = e.detail as { title?: string; subTitle?: string } | undefined;
    if (detail?.title) return [detail.title, detail.subTitle].filter(Boolean).join(" — ");
    return e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

function maskPhone(p: string): string {
  return p.length === 10 ? `${p.slice(0, 2)}••••${p.slice(-2)}` : p;
}
