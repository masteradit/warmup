"use client";

import { useRef, useState } from "react";
import { SessionGate } from "@/components/session-gate";
import { Button, Card, Input } from "@/components/ui";
import { PreferenceForm } from "@/components/preferences/preference-form";
import { useRules } from "@/lib/hooks";
import {
  rulesConfigSchema,
  WEEKDAYS,
  emptyConfig,
  type RulesConfig,
  type RulePreference,
} from "@/lib/cult/rules";
import { exportBackup, importBackup } from "@/lib/storage";

export default function PreferencesPage() {
  return (
    <SessionGate>
      <Preferences />
    </SessionGate>
  );
}

function Preferences() {
  const { rules, setRules } = useRules();
  const [draft, setDraft] = useState<RulesConfig | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const current = draft ?? rules ?? emptyConfig();

  function edit(mut: (c: RulesConfig) => RulesConfig) {
    setDraft(mut(structuredClone(current)));
  }

  function save() {
    const parsed = rulesConfigSchema.safeParse(current);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
      return;
    }
    setRules(parsed.data);
    setDraft(null);
    setError(null);
    setSavedAt(Date.now());
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Rules</h1>
        <div className="flex gap-2">
          {draft && (
            <Button variant="ghost" size="sm" onClick={() => { setDraft(null); setError(null); }}>
              Discard
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!draft}>
            Save
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted">
        Rules describe your ideal class. Warmup ranks the best matching bookable
        slot for each day on the Schedule screen — it never books automatically.
      </p>

      {savedAt && !draft && (
        <p className="text-sm text-ok">Saved {new Date(savedAt).toLocaleTimeString()}.</p>
      )}
      {error && (
        <Card className="p-3 text-xs text-danger whitespace-pre-wrap">{error}</Card>
      )}

      {/* Default preference */}
      <Card className="p-4">
        <p className="mb-3 font-medium">Default</p>
        <PreferenceForm
          complete
          value={current.default}
          onChange={(v) => edit((c) => ({ ...c, default: v }))}
        />
      </Card>

      {/* Profiles */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">Profiles</p>
          <AddProfile
            existing={Object.keys(current.profiles)}
            onAdd={(name) =>
              edit((c) => ({
                ...c,
                profiles: { ...c.profiles, [name]: { ...c.default } },
              }))
            }
          />
        </div>
        {Object.keys(current.profiles).length === 0 && (
          <p className="text-sm text-muted">
            Optional. A profile is a named set of overrides you can attach to
            specific weekdays or dates.
          </p>
        )}
        {Object.entries(current.profiles).map(([name, pref]) => (
          <details key={name} className="rounded-xl border border-app">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium flex items-center justify-between">
              {name}
              <button
                className="text-xs text-danger"
                onClick={(e) => {
                  e.preventDefault();
                  edit((c) => {
                    const { [name]: _, ...rest } = c.profiles;
                    // also detach from any rule that referenced it
                    const detach = (r: RulesConfig["weekly"]) =>
                      Object.fromEntries(
                        Object.entries(r).map(([k, v]) =>
                          v.profile === name ? [k, { ...v, profile: undefined }] : [k, v],
                        ),
                      );
                    return { ...c, profiles: rest, weekly: detach(c.weekly), dates: detach(c.dates) };
                  });
                }}
              >
                Remove
              </button>
            </summary>
            <div className="border-t border-app p-3">
              <PreferenceForm
                value={pref as RulePreference}
                onChange={(v) =>
                  edit((c) => ({ ...c, profiles: { ...c.profiles, [name]: v } }))
                }
              />
            </div>
          </details>
        ))}
      </Card>

      {/* Weekly rules */}
      <Card className="p-4 space-y-2">
        <p className="font-medium">Per weekday</p>
        <p className="text-sm text-muted">
          Leave as “Default” for most days. A date-specific rule (edit the JSON
          below) always wins over a weekday rule.
        </p>
        {WEEKDAYS.map((wd) => {
          const rule = current.weekly[wd];
          const mode = rule?.skip ? "skip" : rule?.profile ?? "default";
          return (
            <div key={wd} className="flex items-center justify-between gap-2 py-1">
              <span className="capitalize text-sm">{wd}</span>
              <select
                className="h-9 rounded-lg border border-app bg-surface px-2 text-sm"
                value={mode}
                onChange={(e) => {
                  const v = e.target.value;
                  edit((c) => {
                    const weekly = { ...c.weekly };
                    if (v === "default") delete weekly[wd];
                    else if (v === "skip") weekly[wd] = { skip: true };
                    else weekly[wd] = { profile: v };
                    return { ...c, weekly };
                  });
                }}
              >
                <option value="default">Default</option>
                <option value="skip">Skip (don&apos;t suggest)</option>
                {Object.keys(current.profiles).map((p) => (
                  <option key={p} value={p}>
                    Profile: {p}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </Card>

      {/* Raw JSON + backup */}
      <Card className="p-4 space-y-3">
        <p className="font-medium">Backup & advanced</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadJson("warmup-backup.json", exportBackup())}
          >
            Export backup
          </Button>
          <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
            Import backup
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const res = importBackup(JSON.parse(await file.text()));
                if (!res.ok) setError(res.error ?? "Import failed.");
                else {
                  setDraft(null);
                  setSavedAt(Date.now());
                  location.reload();
                }
              } catch {
                setError("That file isn't valid JSON.");
              }
            }}
          />
        </div>
        <RawJson
          value={current}
          onValid={(c) => setDraft(c)}
          onError={setError}
        />
      </Card>
    </div>
  );
}

function AddProfile({
  existing,
  onAdd,
}: {
  existing: string[];
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="flex gap-2">
      <Input
        className="h-9 w-32"
        placeholder="weekend"
        value={name}
        onChange={(e) => setName(e.target.value.replace(/[^\w-]/g, ""))}
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          const n = name.trim();
          if (n && n !== "default" && !existing.includes(n)) {
            onAdd(n);
            setName("");
          }
        }}
      >
        Add
      </Button>
    </div>
  );
}

function RawJson({
  value,
  onValid,
  onError,
}: {
  value: RulesConfig;
  onValid: (c: RulesConfig) => void;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [dirty, setDirty] = useState(false);
  return (
    <details>
      <summary className="cursor-pointer text-sm text-muted">Edit as JSON</summary>
      <textarea
        className="mt-2 w-full rounded-xl border border-app bg-surface p-3 font-mono text-xs leading-relaxed"
        rows={16}
        value={dirty ? text : JSON.stringify(value, null, 2)}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            try {
              const parsed = rulesConfigSchema.safeParse(JSON.parse(text));
              if (!parsed.success) {
                onError(
                  parsed.error.issues
                    .map((i) => `${i.path.join(".")}: ${i.message}`)
                    .join("\n"),
                );
                return;
              }
              onValid(parsed.data);
              setDirty(false);
              onError("");
            } catch {
              onError("Invalid JSON.");
            }
          }}
        >
          Apply JSON
        </Button>
      </div>
    </details>
  );
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
