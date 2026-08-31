"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks";
import { Spinner } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const { ready, connected } = useSession();

  useEffect(() => {
    if (!ready) return;
    router.replace(connected ? "/schedule" : "/connect");
  }, [ready, connected, router]);

  return (
    <div className="flex justify-center py-24 text-muted">
      <Spinner />
    </div>
  );
}
