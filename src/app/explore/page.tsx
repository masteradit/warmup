"use client";

import { useEffect, useMemo, useState } from "react";
import { SessionGate } from "@/components/session-gate";
import { Card, EmptyState, Input, Spinner } from "@/components/ui";
import { getCenters } from "@/lib/cult/api";
import type { CenterDirectoryEntry } from "@/lib/cult/types";

export default function ExplorePage() {
  return (
    <SessionGate>
      <Explore />
    </SessionGate>
  );
}

function Explore() {
  const [centers, setCenters] = useState<CenterDirectoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    getCenters()
      .then(setCenters)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load centers"));
  }, []);

  const grouped = useMemo(() => {
    if (!centers) return [];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? centers.filter(
          (c) =>
            c.name.toLowerCase().includes(needle) ||
            c.address?.locality?.toLowerCase().includes(needle) ||
            c.address?.addressString?.toLowerCase().includes(needle),
        )
      : centers;
    const byLocality = new Map<string, CenterDirectoryEntry[]>();
    for (const c of filtered) {
      const key = c.address?.locality || "Other";
      const bucket = byLocality.get(key) ?? [];
      bucket.push(c);
      byLocality.set(key, bucket);
    }
    return [...byLocality.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [centers, q]);

  if (error) {
    return (
      <Card className="p-5 text-sm">
        <p className="font-medium">Couldn&apos;t load centers</p>
        <p className="mt-1 text-muted">{error}</p>
      </Card>
    );
  }

  if (!centers) {
    return (
      <div className="flex justify-center py-24 text-muted">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Explore centers</h1>
      <p className="text-sm text-muted">
        Every center in your selected city. Tap the ID to add it to a rule. To
        switch cities, change your city in the Cult.fit app.
      </p>
      <Input
        placeholder="Search by name or locality"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {grouped.length === 0 ? (
        <EmptyState title="No centers match that search." />
      ) : (
        grouped.map(([locality, list]) => (
          <div key={locality}>
            <p className="mb-1.5 text-sm font-medium text-muted">{locality}</p>
            <div className="space-y-2">
              {list.map((c) => (
                <Card key={c.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.name}</p>
                      {c.address?.addressString && (
                        <p className="text-xs text-muted truncate">
                          {c.address.addressString}
                        </p>
                      )}
                    </div>
                    <button
                      className="shrink-0 rounded-lg bg-surface-2 px-2 py-1 text-xs font-mono text-muted hover:text-fg"
                      onClick={() => navigator.clipboard?.writeText(String(c.id))}
                      title="Copy center ID"
                    >
                      #{c.id}
                    </button>
                  </div>
                  {c.address?.latLong && (
                    <a
                      className="mt-1 inline-block text-xs text-accent"
                      href={`https://www.google.com/maps/search/?api=1&query=${c.address.latLong.lat},${c.address.latLong.long}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Maps
                    </a>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
