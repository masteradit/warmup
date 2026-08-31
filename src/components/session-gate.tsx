"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks";
import { Spinner } from "@/components/ui";

/**
 * Wraps any screen that needs a connected Cult session. Sends the user to
 * /connect if there isn't one. Screens stay simple by assuming a session exists.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, connected } = useSession();

  useEffect(() => {
    if (ready && !connected) router.replace("/connect");
  }, [ready, connected, router]);

  if (!ready || !connected) {
    return (
      <div className="flex justify-center py-24 text-muted">
        <Spinner />
      </div>
    );
  }
  return <>{children}</>;
}
