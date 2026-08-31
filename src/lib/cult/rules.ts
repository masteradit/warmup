/**
 * The preferences / rules engine. Ported from cultbot/src/profile-config.js but
 * modelled as JSON validated with zod instead of hardened YAML.
 *
 * Model:
 *   - `default` preference (complete: centers + workouts + slots|timeRange)
 *   - named `profiles` (partial overrides on top of default)
 *   - `weekly.<weekday>` and `dates."YYYY-MM-DD"` rules, each one of:
 *       { skip: true } | { profile } | inline overrides | { profile, ...overrides }
 *
 * Resolution for a date: exact `dates` entry -> `weekly` weekday -> `default`.
 * A date rule REPLACES the weekday rule (no merge between them).
 * Merge within a resolved rule is shallow: arrays replace, never append.
 */

import { z } from "zod";
import {
  getCenterName,
  iterateCandidates,
  findCandidateClass,
  isWaitlist,
  normalizeTime,
  resolveCandidateTimes,
  type Candidate,
  type Preferences,
} from "./schedule";
import type { DaySchedule, EnrichedClass, ScheduleResponse } from "./types";

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const DEFAULT_SELECTION_ORDER: Preferences["selectionOrder"] = [
  "times",
  "centers",
  "workouts",
];

const timeString = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "must be HH:mm or HH:mm:ss")
  .refine((v) => {
    const [h, m, s = "0"] = v.split(":");
    return Number(h) < 24 && Number(m) < 60 && Number(s) < 60;
  }, "invalid clock time");

const timeRangeString = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?-\d{2}:\d{2}(:\d{2})?$/, "must be HH:mm-HH:mm")
  .refine((v) => {
    const [a, b] = v.split("-").map((t) => normalizeTime(t)!);
    return a <= b;
  }, "start must not be after end");

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .refine((v) => {
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "not a real calendar date");

const preferenceShape = {
  centers: z.array(z.number().int().positive()).min(1).optional(),
  workouts: z.array(z.string().trim().min(1)).min(1).optional(),
  slots: z.array(timeString).min(1).optional(),
  timeRange: timeRangeString.optional(),
  enableWaitlist: z.boolean().optional(),
  selectionOrder: z
    .array(z.enum(["times", "centers", "workouts"]))
    .length(3)
    .refine((a) => new Set(a).size === 3, "each dimension exactly once")
    .optional(),
};

export const partialPreferenceSchema = z.object(preferenceShape).strict();

const ruleSchema = z
  .object({ ...preferenceShape, skip: z.literal(true).optional(), profile: z.string().min(1).optional() })
  .strict()
  .refine(
    (r) => !(r.skip && Object.keys(r).length > 1),
    "skip: true cannot be combined with other fields",
  )
  .refine(
    (r) =>
      r.skip ||
      r.profile ||
      Object.keys(r).some((k) => k in preferenceShape),
    "a rule must skip, pick a profile, or override at least one preference",
  );

export const rulesConfigSchema = z
  .object({
    version: z.literal(1),
    default: z.object(preferenceShape).strict(),
    profiles: z.record(z.string(), partialPreferenceSchema).default({}),
    weekly: z.record(z.enum(WEEKDAYS), ruleSchema).default({}),
    dates: z.record(dateString, ruleSchema).default({}),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    const complete = withDefaults(cfg.default);
    if (!complete.centers.length)
      ctx.addIssue({ code: "custom", path: ["default", "centers"], message: "required" });
    if (!complete.workouts.length)
      ctx.addIssue({ code: "custom", path: ["default", "workouts"], message: "required" });
    if (!complete.slots?.length && !complete.timeRange)
      ctx.addIssue({ code: "custom", path: ["default"], message: "needs slots or timeRange" });
    for (const [name, rule] of Object.entries(cfg.weekly))
      if (rule.profile && rule.profile !== "default" && !(rule.profile in cfg.profiles))
        ctx.addIssue({ code: "custom", path: ["weekly", name, "profile"], message: `unknown profile "${rule.profile}"` });
    for (const [name, rule] of Object.entries(cfg.dates))
      if (rule.profile && rule.profile !== "default" && !(rule.profile in cfg.profiles))
        ctx.addIssue({ code: "custom", path: ["dates", name, "profile"], message: `unknown profile "${rule.profile}"` });
  });

export type RulesConfig = z.infer<typeof rulesConfigSchema>;
export type RulePreference = z.infer<typeof partialPreferenceSchema>;

function withDefaults(p: RulePreference): Preferences {
  return {
    centers: p.centers ?? [],
    workouts: p.workouts ?? [],
    slots: p.slots,
    timeRange: p.timeRange,
    enableWaitlist: p.enableWaitlist ?? true,
    selectionOrder: p.selectionOrder ?? [...DEFAULT_SELECTION_ORDER],
  };
}

export function weekdayFor(date: string): Weekday {
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

export type ResolvedPreferences =
  | { skip: true; source: "default" | "weekday" | "date"; date: string; weekday: Weekday }
  | {
      skip: false;
      source: "default" | "weekday" | "date";
      date: string;
      weekday: Weekday;
      profile: string;
      preferences: Preferences;
    };

/**
 * Resolve the effective preferences for a given date.
 * @throws {z.ZodError} never — the config is validated on load; this assumes a valid config.
 */
export function resolvePreferences(
  config: RulesConfig,
  date: string,
): ResolvedPreferences {
  const parsedDate = dateString.parse(date);
  const weekday = weekdayFor(parsedDate);

  let source: "default" | "weekday" | "date" = "default";
  type Rule = z.infer<typeof ruleSchema>;
  let rule: Rule | undefined;
  const dateRule = config.dates[parsedDate] as Rule | undefined;
  const weekdayRule = config.weekly[weekday] as Rule | undefined;
  if (dateRule) {
    source = "date";
    rule = dateRule;
  } else if (weekdayRule) {
    source = "weekday";
    rule = weekdayRule;
  }

  if (rule?.skip) return { skip: true, source, date: parsedDate, weekday };

  const profileName = rule?.profile ?? "default";
  const base: RulePreference =
    profileName === "default"
      ? config.default
      : { ...config.default, ...config.profiles[profileName] };
  const { skip: _s, profile: _p, ...overrides } = rule ?? {};
  const merged = withDefaults({ ...base, ...overrides });

  return {
    skip: false,
    source,
    date: parsedDate,
    weekday,
    profile: profileName,
    preferences: merged,
  };
}

/**
 * Every center referenced anywhere in the config — default, all profiles, all
 * rules — deduped, in config order. Used to scope the `centerId=` query so
 * centers outside the account's app-selected locality are still returned.
 */
export function collectConfiguredCenters(config: RulesConfig | null): number[] {
  if (!config) return [];
  const centers: number[] = [...(config.default.centers ?? [])];
  for (const p of Object.values(config.profiles)) centers.push(...(p.centers ?? []));
  for (const r of [...Object.values(config.weekly), ...Object.values(config.dates)])
    centers.push(...(r.centers ?? []));
  return [...new Set(centers)];
}

export interface RankedMatch {
  klass: EnrichedClass;
  rank: number;
  /** 1-based position among all candidate combinations (lower = more preferred). */
  priority: number;
  waitlist: boolean;
  /** Plain-English explanation of why this slot matched. */
  reason: string;
}

/**
 * Rank the bookable classes in a day against a resolved preference set, best
 * first. This is what the UI's "best match" ribbon consumes. It never books.
 */
export function rankMatches(
  classes: ScheduleResponse,
  daySchedule: DaySchedule | null,
  preferences: Preferences,
  limit = 5,
): RankedMatch[] {
  if (!daySchedule) return [];
  const times = resolveCandidateTimes(daySchedule, preferences);
  const seen = new Set<string>();
  const out: RankedMatch[] = [];
  let priority = 0;

  for (const candidate of iterateCandidates(preferences, times)) {
    priority += 1;
    const match = findCandidateClass(
      daySchedule,
      candidate,
      preferences.enableWaitlist,
    );
    if (!match || seen.has(match.id)) continue;
    seen.add(match.id);

    const centerName = getCenterName(classes, candidate.centerId);
    const wl = isWaitlist(match);
    out.push({
      klass: { ...match, centerName, slot: candidate.slot },
      rank: out.length + 1,
      priority,
      waitlist: wl,
      reason: buildReason(candidate, centerName, preferences, wl, match.availableSeats, match.waitlistInfo?.waitlistedUserCount),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function buildReason(
  c: Candidate,
  centerName: string | null,
  prefs: Preferences,
  waitlist: boolean,
  seats: number,
  ahead?: number,
): string {
  const bits: string[] = [];
  const workoutRank = prefs.workouts.indexOf(c.workout);
  const centerRank = prefs.centers.indexOf(c.centerId);
  bits.push(`${c.workout} at ${centerName ?? `center ${c.centerId}`}, ${prettyTime(c.slot)}`);
  const why: string[] = [];
  if (workoutRank === 0) why.push("your top workout");
  else if (workoutRank > 0) why.push(`#${workoutRank + 1} workout`);
  if (centerRank === 0) why.push("your top center");
  else if (centerRank > 0) why.push(`#${centerRank + 1} center`);
  if (why.length) bits.push(why.join(", "));
  bits.push(waitlist ? `waitlist (${ahead ?? 0} ahead)` : `${seats} seat${seats === 1 ? "" : "s"} open`);
  return bits.join(" — ");
}

export function prettyTime(hms: string): string {
  const [h, m] = hms.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

/** A minimal valid config, used to seed the rules editor on first run. */
export function emptyConfig(): RulesConfig {
  return {
    version: 1,
    default: {
      centers: [],
      workouts: [],
      slots: ["07:00", "18:00"],
      enableWaitlist: true,
      selectionOrder: [...DEFAULT_SELECTION_ORDER],
    },
    profiles: {},
    weekly: {},
    dates: {},
  };
}
