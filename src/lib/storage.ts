/**
 * All client-side persistence. Everything the app remembers lives in the
 * viewer's own browser localStorage — there is no server database. Each value is
 * namespaced under `warmup:` and every read is defensive (private windows,
 * cleared storage, and quota errors must not crash the app).
 */

"use client";

import type { CultSession } from "./cult/client";
import type { BookingResult } from "./cult/types";
import type { RulesConfig } from "./cult/rules";
import { emptyConfig, rulesConfigSchema } from "./cult/rules";

const KEYS = {
  session: "warmup:session",
  rules: "warmup:rules",
  history: "warmup:history",
  settings: "warmup:settings",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* ----------------------------- session ----------------------------- */

export interface StoredSession {
  session: CultSession;
  /** How it was obtained, for display. */
  method: "otp" | "curl";
  /** Phone number (masked in UI) if known. */
  phone?: string;
  connectedAt: number;
}

export const sessionStore = {
  get: () => read<StoredSession | null>(KEYS.session, null),
  set: (s: StoredSession) => write(KEYS.session, s),
  clear: () => remove(KEYS.session),
};

/* ------------------------------ rules ------------------------------ */

export const rulesStore = {
  get(): RulesConfig {
    const raw = read<unknown>(KEYS.rules, null);
    if (!raw) return emptyConfig();
    const parsed = rulesConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : emptyConfig();
  },
  set: (c: RulesConfig) => write(KEYS.rules, c),
  clear: () => remove(KEYS.rules),
};

/* ----------------------------- history ---------------------------- */

export interface HistoryEntry extends BookingResult {
  id: string;
  at: number;
  /** True if this was a dry run of the rules engine. */
  dryRun: boolean;
}

const HISTORY_CAP = 200;

export const historyStore = {
  get: () => read<HistoryEntry[]>(KEYS.history, []),
  add(entry: Omit<HistoryEntry, "id" | "at">): HistoryEntry {
    const full: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      at: Date.now(),
    };
    const next = [full, ...historyStore.get()].slice(0, HISTORY_CAP);
    write(KEYS.history, next);
    return full;
  },
  clear: () => remove(KEYS.history),
};

/* ----------------------------- settings --------------------------- */

export interface Settings {
  /** Stop the rules engine before the booking POST. */
  dryRun: boolean;
  /** Which day the schedule opens on. */
  defaultDay: "first" | "last";
  /** Selected city for the explorer. */
  exploreCityId?: string;
}

const DEFAULT_SETTINGS: Settings = { dryRun: false, defaultDay: "first" };

export const settingsStore = {
  get: (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEYS.settings, {}) }),
  set: (s: Partial<Settings>) =>
    write(KEYS.settings, { ...settingsStore.get(), ...s }),
  clear: () => remove(KEYS.settings),
};

/* -------------------------- export / import ---------------------- */

export interface WarmupBackup {
  kind: "warmup-backup";
  version: 1;
  exportedAt: string;
  rules: RulesConfig;
  history: HistoryEntry[];
  settings: Settings;
  /** Session is NEVER included in a backup — it is a credential. */
}

export function exportBackup(): WarmupBackup {
  return {
    kind: "warmup-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    rules: rulesStore.get(),
    history: historyStore.get(),
    settings: settingsStore.get(),
  };
}

export function importBackup(data: unknown): { ok: boolean; error?: string } {
  if (
    !data ||
    typeof data !== "object" ||
    (data as WarmupBackup).kind !== "warmup-backup"
  ) {
    return { ok: false, error: "Not a Warmup backup file." };
  }
  const backup = data as WarmupBackup;
  const rules = rulesConfigSchema.safeParse(backup.rules);
  if (!rules.success) return { ok: false, error: "Backup has invalid rules." };
  rulesStore.set(rules.data);
  if (Array.isArray(backup.history)) write(KEYS.history, backup.history);
  if (backup.settings) settingsStore.set(backup.settings);
  return { ok: true };
}
