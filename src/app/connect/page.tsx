"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { OtpFlow } from "@/components/connect/otp-flow";
import { CurlFlow } from "@/components/connect/curl-flow";
import { useSession } from "@/lib/hooks";
import type { StoredSession } from "@/lib/storage";

const OTP_ENABLED = process.env.NEXT_PUBLIC_ENABLE_OTP_LOGIN !== "false";

export default function ConnectPage() {
  const router = useRouter();
  const { session, connect, disconnect } = useSession();
  const [method, setMethod] = useState<"otp" | "curl">(OTP_ENABLED ? "otp" : "curl");

  function handleConnected(s: StoredSession) {
    connect(s);
    router.replace("/schedule");
  }

  if (session) {
    return (
      <div className="space-y-4 py-4">
        <h1 className="text-xl font-semibold">Account</h1>
        <Card className="p-4 space-y-1">
          <p className="text-sm">
            Connected via{" "}
            <span className="font-medium">
              {session.method === "otp" ? "phone OTP" : "pasted session"}
            </span>
            {session.phone ? ` · ${session.phone.slice(0, 2)}••••${session.phone.slice(-2)}` : ""}
          </p>
          <p className="text-xs text-muted">
            since {new Date(session.connectedAt).toLocaleString()}
          </p>
        </Card>
        <p className="text-sm text-muted">
          Your Cult.fit session lives only in this browser. Cult sessions expire
          after a while — if things stop loading, reconnect here.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.replace("/schedule")}>
            Back to schedule
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              disconnect();
            }}
          >
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Connect your Cult.fit account</h1>
        <p className="mt-1 text-sm text-muted">
          Warmup talks to Cult.fit on your behalf. Your session is stored only in
          this browser and sent only to Warmup&apos;s own proxy.
        </p>
      </div>

      {OTP_ENABLED && (
        <div className="flex rounded-xl bg-surface-2 p-1 text-sm font-medium">
          {(["otp", "curl"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={cn(
                "flex-1 rounded-lg py-2 transition-colors",
                method === m ? "bg-surface text-fg shadow-sm" : "text-muted",
              )}
            >
              {m === "otp" ? "Phone & OTP" : "Paste session"}
            </button>
          ))}
        </div>
      )}

      <Card className="p-4">
        {method === "otp" && OTP_ENABLED ? (
          <OtpFlow onConnected={handleConnected} />
        ) : (
          <CurlFlow onConnected={handleConnected} />
        )}
      </Card>

      {method === "otp" && (
        <p className="text-xs text-muted">
          The phone login uses Cult.fit&apos;s own verification. If it doesn&apos;t
          go through, switch to “Paste session”.
        </p>
      )}
    </div>
  );
}
