"use client";

import { useState } from "react";
import { Button, Input, Toggle } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { RulePreference } from "@/lib/cult/rules";

/**
 * Editor for one preference block — used for `default` and for each named
 * profile. Everything is a controlled edit of a partial preference object;
 * `complete` toggles the required-field hints for the default block.
 */
export function PreferenceForm({
  value,
  onChange,
  complete,
}: {
  value: RulePreference;
  onChange: (next: RulePreference) => void;
  complete?: boolean;
}) {
  const set = (patch: Partial<RulePreference>) => onChange({ ...value, ...patch });
  const timeMode: "slots" | "range" = value.timeRange ? "range" : "slots";

  return (
    <div className="space-y-5">
      <OrderedList
        label="Centers"
        hint={complete ? "At least one. Earlier = higher priority." : "Earlier = higher priority."}
        items={(value.centers ?? []).map(String)}
        onChange={(items) =>
          set({ centers: items.map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0) })
        }
        placeholder="Center ID, e.g. 267"
        numeric
      />

      <OrderedList
        label="Workouts"
        hint={
          complete
            ? "At least one. Exact, case-sensitive names (e.g. HRX WORKOUT)."
            : "Exact, case-sensitive names."
        }
        items={value.workouts ?? []}
        onChange={(items) => set({ workouts: items })}
        placeholder="Workout name, e.g. YOGA"
      />

      <div>
        <div className="mb-1.5 flex items-center gap-3">
          <span className="text-sm font-medium">Times</span>
          <div className="flex rounded-lg bg-surface-2 p-0.5 text-xs">
            {(["slots", "range"] as const).map((m) => (
              <button
                key={m}
                onClick={() =>
                  m === "range"
                    ? set({ timeRange: value.timeRange ?? "07:00-09:00", slots: undefined })
                    : set({ slots: value.slots ?? ["07:00"], timeRange: undefined })
                }
                className={cn(
                  "rounded-md px-2 py-1",
                  timeMode === m ? "bg-surface text-fg" : "text-muted",
                )}
              >
                {m === "slots" ? "Specific slots" : "Range"}
              </button>
            ))}
          </div>
        </div>
        {timeMode === "slots" ? (
          <OrderedList
            label=""
            hint="Tried in this order. HH:mm."
            items={value.slots ?? []}
            onChange={(items) => set({ slots: items })}
            placeholder="07:00"
          />
        ) : (
          <div className="flex items-center gap-2">
            <Input
              className="w-28"
              placeholder="07:00"
              value={value.timeRange?.split("-")[0] ?? ""}
              onChange={(e) =>
                set({ timeRange: `${e.target.value}-${value.timeRange?.split("-")[1] ?? ""}` })
              }
            />
            <span className="text-muted">to</span>
            <Input
              className="w-28"
              placeholder="09:00"
              value={value.timeRange?.split("-")[1] ?? ""}
              onChange={(e) =>
                set({ timeRange: `${value.timeRange?.split("-")[0] ?? ""}-${e.target.value}` })
              }
            />
          </div>
        )}
      </div>

      <label className="flex items-center justify-between">
        <span className="text-sm font-medium">Join waitlist if no open seat</span>
        <Toggle
          checked={value.enableWaitlist ?? true}
          onChange={(v) => set({ enableWaitlist: v })}
          label="Enable waitlist"
        />
      </label>

      <div>
        <p className="mb-1.5 text-sm font-medium">Priority order</p>
        <p className="mb-2 text-xs text-muted">
          The outermost dimension is honoured first when picking a slot.
        </p>
        <SelectionOrder
          value={value.selectionOrder ?? ["times", "centers", "workouts"]}
          onChange={(o) => set({ selectionOrder: o })}
        />
      </div>
    </div>
  );
}

/* ------------------------- ordered string list ------------------------- */

function OrderedList({
  label,
  hint,
  items,
  onChange,
  placeholder,
  numeric,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  numeric?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft("");
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      {label && <p className="mb-1 text-sm font-medium">{label}</p>}
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={it} className="flex items-center gap-2 rounded-lg border border-app bg-surface px-2 py-1.5">
            <span className="w-5 text-center text-xs text-muted">{i + 1}</span>
            <span className="flex-1 truncate text-sm">{it}</span>
            <button className="px-1 text-muted hover:text-fg disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button className="px-1 text-muted hover:text-fg disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === items.length - 1}>↓</button>
            <button className="px-1 text-muted hover:text-danger" onClick={() => onChange(items.filter((x) => x !== it))}>✕</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          inputMode={numeric ? "numeric" : "text"}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(numeric ? e.target.value.replace(/\D/g, "") : e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
        />
        <Button variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------- selection order --------------------------- */

function SelectionOrder({
  value,
  onChange,
}: {
  value: ("times" | "centers" | "workouts")[];
  onChange: (v: ("times" | "centers" | "workouts")[]) => void;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {value.map((dim, i) => (
        <div key={dim} className="flex items-center gap-2 rounded-lg border border-app bg-surface px-2 py-1.5 text-sm">
          <span className="w-5 text-center text-xs text-muted">{i + 1}</span>
          <span className="flex-1 capitalize">{dim}</span>
          <button className="px-1 text-muted hover:text-fg disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
          <button className="px-1 text-muted hover:text-fg disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === value.length - 1}>↓</button>
        </div>
      ))}
    </div>
  );
}
