"use client";

import { Badge, Card } from "@/components/ui";
import { ClassCard } from "./class-card";
import type { RankedMatch } from "@/lib/cult/rules";

/**
 * The "best match" ribbon. Shows the rules engine's top-ranked bookable slots
 * for the selected day. It ranks and explains — it never books on its own; the
 * user taps Book on the card like anywhere else.
 */
export function BestMatch({
  matches,
  date,
  dryRun,
  onBooked,
  onSessionExpired,
}: {
  matches: RankedMatch[];
  date: string;
  dryRun: boolean;
  onBooked: () => void;
  onSessionExpired: () => void;
}) {
  if (matches.length === 0) return null;
  const [top, ...rest] = matches;

  return (
    <Card className="p-3 border-accent">
      <div className="mb-2 flex items-center gap-2">
        <Badge tone="accent">Best match</Badge>
        <span className="text-xs text-muted">
          from your rules{dryRun ? " · dry run" : ""}
        </span>
      </div>
      <ClassCard
        cls={top.klass}
        centerName={top.klass.centerName}
        date={date}
        highlight
        reason={top.reason}
        dryRun={dryRun}
        onBooked={onBooked}
        onSessionExpired={onSessionExpired}
      />
      {rest.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted">
            {rest.length} more match{rest.length === 1 ? "" : "es"}
          </summary>
          <div className="mt-2 space-y-2">
            {rest.map((m) => (
              <ClassCard
                key={m.klass.id}
                cls={m.klass}
                centerName={m.klass.centerName}
                date={date}
                reason={m.reason}
                dryRun={dryRun}
                onBooked={onBooked}
                onSessionExpired={onSessionExpired}
              />
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
