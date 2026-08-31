"use client";

import { useEffect, useState } from "react";
import { SessionGate } from "@/components/session-gate";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { historyStore, type HistoryEntry } from "@/lib/storage";
import type { BookingStatus } from "@/lib/cult/types";

const TONE: Record<BookingStatus, "ok" | "warn" | "danger" | "neutral" | "accent"> = {
  booked: "ok",
  waitlisted: "warn",
  "dry-run": "accent",
  skipped: "neutral",
  unavailable: "neutral",
  error: "danger",
};

export default function HistoryPage() {
  return (
    <SessionGate>
      <History />
    </SessionGate>
  );
}

function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  useEffect(() => setEntries(historyStore.get()), []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">History</h1>
        {entries.length > 0 && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              historyStore.clear();
              setEntries([]);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState title="Nothing here yet.">
          Bookings and dry runs you make will show up here.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <Card key={e.id} className="p-3">
              <div className="flex items-center gap-2">
                <Badge tone={TONE[e.status]}>{e.status}</Badge>
                <span className="text-xs text-muted">
                  {new Date(e.at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-sm">{e.message}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
