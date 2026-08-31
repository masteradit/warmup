"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SessionGate } from "@/components/session-gate";
import { Badge, Button, Card, EmptyState, Spinner, Toggle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { BestMatch } from "@/components/schedule/best-match";
import { ClassCard } from "@/components/schedule/class-card";
import { useRules, useSchedule, useSession, useSettings } from "@/lib/hooks";
import {
  getDaySchedule,
  getCenterName,
  hasExistingBooking,
  findExistingBooking,
  iterateClasses,
} from "@/lib/cult/schedule";
import {
  collectConfiguredCenters,
  rankMatches,
  resolvePreferences,
  prettyTime,
} from "@/lib/cult/rules";

export default function SchedulePage() {
  return (
    <SessionGate>
      <Schedule />
    </SessionGate>
  );
}

function Schedule() {
  const router = useRouter();
  const { disconnect } = useSession();
  const { rules } = useRules();
  const { settings, update } = useSettings();

  const configuredCenters = useMemo(
    () => (rules ? collectConfiguredCenters(rules) : []),
    [rules],
  );
  const { data, loading, error, sessionExpired, reload } = useSchedule(
    configuredCenters,
    true,
  );

  const [dayId, setDayId] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.days?.length) return;
    setDayId((cur) => {
      if (cur && data.days.some((d) => d.id === cur)) return cur;
      return settings.defaultDay === "last"
        ? data.days[data.days.length - 1].id
        : data.days[0].id;
    });
  }, [data, settings.defaultDay]);

  useEffect(() => {
    if (sessionExpired) router.replace("/connect");
  }, [sessionExpired, router]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-24 text-muted">
        <Spinner />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card className="p-5 space-y-3">
        <p className="font-medium">Couldn&apos;t load the schedule</p>
        <p className="text-sm text-muted">{error.message}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reload}>
            Retry
          </Button>
          <Button variant="danger" onClick={() => { disconnect(); router.replace("/connect"); }}>
            Reconnect
          </Button>
        </div>
      </Card>
    );
  }

  if (!data || !dayId) {
    return <EmptyState title="No classes in the schedule right now." />;
  }

  const day = getDaySchedule(data, dayId);
  const existing = day ? findExistingBooking(day) : null;
  const alreadyBooked = day ? hasExistingBooking(day) : false;

  const resolved = rules ? resolvePreferences(rules, dayId) : null;
  const matches =
    resolved && !resolved.skip && day
      ? rankMatches(data, day, resolved.preferences)
      : [];

  const timeList = day?.classByTimeList ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{data.header?.title ?? "Schedule"}</h1>
        <label className="flex items-center gap-2 text-xs text-muted">
          Dry run
          <Toggle
            checked={settings.dryRun}
            onChange={(v) => update({ dryRun: v })}
            label="Dry run mode"
          />
        </label>
      </div>

      {/* Day tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {data.days.map((d) => (
          <button
            key={d.id}
            onClick={() => setDayId(d.id)}
            className={cn(
              "shrink-0 rounded-xl border px-3 py-2 text-sm transition-colors",
              d.id === dayId
                ? "border-accent bg-surface text-fg"
                : "border-app bg-surface-2 text-muted",
            )}
          >
            {formatDayLabel(d.id)}
          </button>
        ))}
      </div>

      {configuredCenters.length === 0 && (
        <Card className="p-3 text-sm text-muted">
          Showing your home locality only. Add centers in{" "}
          <Link href="/preferences" className="text-accent">
            Rules
          </Link>{" "}
          to pull in others and get a best match.
        </Card>
      )}

      {alreadyBooked && existing && (
        <Card className="p-3 flex items-center gap-2 text-sm">
          <Badge tone="ok">Booked</Badge>
          <span>
            {existing.cls.workoutName} at {prettyTime(existing.cls.startTime)},{" "}
            {getCenterName(data, existing.centerId) ?? `center ${existing.centerId}`}
          </span>
        </Card>
      )}

      {resolved?.skip && (
        <Card className="p-3 text-sm text-muted">
          Your rules skip {resolved.weekday}s — no best match shown.
        </Card>
      )}

      {!alreadyBooked && matches.length > 0 && (
        <BestMatch
          matches={matches}
          date={dayId}
          dryRun={settings.dryRun}
          onBooked={reload}
          onSessionExpired={() => router.replace("/connect")}
        />
      )}

      {/* Full schedule grouped by time */}
      <div className="space-y-4">
        {timeList.length === 0 && (
          <EmptyState title="No classes listed for this day." />
        )}
        {timeList.map((slot) => {
          const classes = [...iterateClasses({ id: dayId, classByTimeList: [slot] })];
          if (classes.length === 0) return null;
          return (
            <div key={slot.id}>
              <p className="mb-1.5 text-sm font-medium text-muted">
                {prettyTime(slot.id)}
              </p>
              <div className="space-y-2">
                {classes.map(({ cls, centerId }) => (
                  <ClassCard
                    key={cls.id}
                    cls={cls}
                    centerName={getCenterName(data, centerId)}
                    date={dayId}
                    dryRun={settings.dryRun}
                    onBooked={reload}
                    onSessionExpired={() => router.replace("/connect")}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const dm = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (isToday) return `Today · ${dm}`;
  if (isTomorrow) return `Tomorrow · ${dm}`;
  return `${weekday} · ${dm}`;
}
