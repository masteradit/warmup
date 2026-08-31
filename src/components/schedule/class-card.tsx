"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { prettyTime } from "@/lib/cult/rules";
import { bookClass, ProxyError } from "@/lib/cult/api";
import { historyStore } from "@/lib/storage";
import type { CultClass } from "@/lib/cult/types";

const UNBOOKABLE = new Set(["SEAT_NOT_AVAILABLE", "WAITLIST_FULL"]);

export function ClassCard({
  cls,
  centerName,
  date,
  highlight,
  reason,
  dryRun = false,
  onBooked,
  onSessionExpired,
}: {
  cls: CultClass;
  centerName: string | null;
  date: string;
  highlight?: boolean;
  reason?: string;
  dryRun?: boolean;
  onBooked: () => void;
  onSessionExpired: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; msg: string }>(null);

  const booked = cls.state === "BOOKED" || cls.isBooked;
  const waitlist = cls.state === "WAITLIST_AVAILABLE";
  const unbookable = UNBOOKABLE.has(cls.state);
  const ahead = cls.waitlistInfo?.waitlistedUserCount ?? 0;

  async function doBook() {
    setBusy(true);
    setResult(null);

    if (dryRun) {
      const label = `${waitlist ? "Would join waitlist for" : "Would book"} ${cls.workoutName} at ${centerName ?? `center ${cls.centerID}`}, ${prettyTime(cls.startTime)} on ${date}`;
      historyStore.add({ status: "dry-run", message: label, date, dryRun: true });
      setResult({ ok: true, msg: "Dry run — nothing booked" });
      setBusy(false);
      return;
    }

    try {
      await bookClass(cls.id);
      const msg = waitlist
        ? `Joined waitlist for ${cls.workoutName}`
        : `Booked ${cls.workoutName}`;
      historyStore.add({
        status: waitlist ? "waitlisted" : "booked",
        message: `${msg} at ${centerName ?? `center ${cls.centerID}`}, ${prettyTime(cls.startTime)} on ${date}`,
        date,
        dryRun: false,
      });
      setResult({ ok: true, msg });
      onBooked();
    } catch (e) {
      const pe = e instanceof ProxyError ? e : null;
      const msg = pe?.message ?? "Booking failed";
      historyStore.add({
        status: "error",
        message: `${msg} — ${cls.workoutName} on ${date}`,
        date,
        dryRun: false,
      });
      setResult({ ok: false, msg });
      if (pe?.sessionExpired) onSessionExpired();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
        highlight ? "border-accent bg-surface" : "border-app bg-surface",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{cls.workoutName}</span>
          {booked && <Badge tone="ok">Booked</Badge>}
          {!booked && waitlist && <Badge tone="warn">Waitlist</Badge>}
        </div>
        <p className="text-xs text-muted truncate">
          {prettyTime(cls.startTime)} · {centerName ?? `Center ${cls.centerID}`}
        </p>
        {reason && <p className="mt-0.5 text-xs text-accent truncate">{reason}</p>}
        {result && (
          <p className={cn("mt-0.5 text-xs", result.ok ? "text-ok" : "text-danger")}>
            {result.msg}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        {booked ? (
          <span className="text-xs text-muted">You&apos;re in</span>
        ) : unbookable ? (
          <span className="text-xs text-muted">
            {cls.state === "WAITLIST_FULL" ? "Waitlist full" : "Full"}
          </span>
        ) : (
          <>
            <Button size="sm" loading={busy} onClick={doBook} disabled={!!result?.ok}>
              {waitlist ? "Join waitlist" : "Book"}
            </Button>
            <p className="mt-1 text-[11px] text-muted">
              {waitlist ? `${ahead} ahead` : `${cls.availableSeats} left`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
