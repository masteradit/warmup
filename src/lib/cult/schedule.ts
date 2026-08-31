/**
 * Pure helpers for reading the Cult.fit `classes/v2` response. No network, no
 * side effects. Ported from cultbot/src/schedule.js and adapted to TypeScript
 * and the class `state` values that appear in real responses.
 */

import {
  BOOKABLE_STATES,
  WAITLIST_STATE,
} from "./constants";
import type {
  CultClass,
  DaySchedule,
  ScheduleResponse,
  TimeSlot,
} from "./types";

/** Normalise "HH:mm" or "HH:mm:ss" to "HH:mm:ss". Returns null if unparseable. */
export function normalizeTime(value: string | undefined | null): string | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value ?? ""));
  if (!m) return null;
  return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
}

/**
 * Picks which day to read from the schedule.
 * @param selector 'first' | 'last' | a specific "YYYY-MM-DD"
 */
export function selectDay(
  classes: Pick<ScheduleResponse, "days"> | null | undefined,
  selector: "first" | "last" | string = "last",
): string | null {
  const days = classes?.days ?? [];
  if (days.length === 0) return null;
  if (selector === "last") return days[days.length - 1].id;
  if (selector === "first") return days[0].id;
  const match = days.find((d) => String(d.id) === String(selector));
  return match ? match.id : null;
}

export function getDaySchedule(
  classes: Pick<ScheduleResponse, "classByDateMap"> | null | undefined,
  dayId: string,
): DaySchedule | null {
  return classes?.classByDateMap?.[dayId] ?? null;
}

/** Every class in a day, optionally filtered to one center. */
export function* iterateClasses(
  daySchedule: DaySchedule | null | undefined,
  centerId: number | null = null,
): Generator<{ timeSlotId: string; centerId: number; cls: CultClass }> {
  for (const timeSlot of daySchedule?.classByTimeList ?? []) {
    for (const center of timeSlot.centerWiseClasses ?? []) {
      if (centerId !== null && center.centerId !== centerId) continue;
      for (const cls of center.classes ?? []) {
        yield { timeSlotId: timeSlot.id, centerId: center.centerId, cls };
      }
    }
  }
}

/** True if the user already holds a seat anywhere in this day's schedule. */
export function hasExistingBooking(
  daySchedule: DaySchedule | null | undefined,
): boolean {
  for (const { cls } of iterateClasses(daySchedule)) {
    if (cls.state === "BOOKED" || cls.isBooked === true) return true;
  }
  return false;
}

/** The class the user already booked for this day, if any. */
export function findExistingBooking(
  daySchedule: DaySchedule | null | undefined,
): { timeSlotId: string; centerId: number; cls: CultClass } | null {
  for (const entry of iterateClasses(daySchedule)) {
    if (entry.cls.state === "BOOKED" || entry.cls.isBooked === true) return entry;
  }
  return null;
}

/**
 * Ordered time dimension: explicit `slots` first (in given order), then every
 * live schedule time inside `timeRange` (chronological), deduped.
 */
export function resolveCandidateTimes(
  daySchedule: DaySchedule | null | undefined,
  { slots = [], timeRange }: { slots?: string[]; timeRange?: string },
): string[] {
  const ordered: string[] = [];
  for (const s of slots) {
    const n = normalizeTime(s);
    if (n) ordered.push(n);
  }
  if (timeRange) {
    const [start, end] = timeRange.split("-").map((t) => normalizeTime(t));
    if (start && end) {
      const ranged = (daySchedule?.classByTimeList ?? [])
        .map((item) => normalizeTime(item.id))
        .filter((slot): slot is string => !!slot && slot >= start && slot <= end)
        .sort();
      ordered.push(...ranged);
    }
  }
  return [...new Set(ordered)];
}

export interface Preferences {
  centers: number[];
  workouts: string[];
  slots?: string[];
  timeRange?: string;
  enableWaitlist: boolean;
  selectionOrder: ("times" | "centers" | "workouts")[];
}

export interface Candidate {
  slot: string;
  centerId: number;
  workout: string;
}

/**
 * Every time/center/workout combination, walked with `selectionOrder` from
 * outermost (highest priority) to innermost. The first combination that maps to
 * a bookable class wins.
 */
export function* iterateCandidates(
  preferences: Preferences,
  times: string[],
): Generator<Candidate> {
  const dimensions: Record<string, (string | number)[]> = {
    times,
    centers: preferences.centers,
    workouts: preferences.workouts,
  };
  const selected: Record<string, string | number> = {};

  function* walk(depth: number): Generator<Candidate> {
    if (depth === preferences.selectionOrder.length) {
      yield {
        slot: String(selected.times),
        centerId: Number(selected.centers),
        workout: String(selected.workouts),
      };
      return;
    }
    const dimension = preferences.selectionOrder[depth];
    for (const value of dimensions[dimension]) {
      selected[dimension] = value;
      yield* walk(depth + 1);
    }
  }
  yield* walk(0);
}

/**
 * The class matching one exact candidate, when its state permits booking.
 * Workout name match is exact and case-sensitive — same as the Cult app.
 */
export function findCandidateClass(
  daySchedule: DaySchedule | null | undefined,
  candidate: Candidate,
  enableWaitlist: boolean,
): (CultClass & { centerId: number; slot: string }) | null {
  const timeSlot: TimeSlot | undefined = (
    daySchedule?.classByTimeList ?? []
  ).find((item) => normalizeTime(item.id) === candidate.slot);
  if (!timeSlot) return null;

  const center = (timeSlot.centerWiseClasses ?? []).find(
    (item) => item.centerId === candidate.centerId,
  );
  if (!center) return null;

  const allowed = enableWaitlist
    ? BOOKABLE_STATES
    : new Set(["AVAILABLE"]);
  const match = (center.classes ?? []).find(
    (cls) => cls.workoutName === candidate.workout && allowed.has(cls.state),
  );
  return match
    ? { ...match, centerId: candidate.centerId, slot: candidate.slot }
    : null;
}

export function isWaitlist(cls: Pick<CultClass, "state">): boolean {
  return cls.state === WAITLIST_STATE;
}

/** Resolve a center's display name from the schedule metadata. */
export function getCenterName(
  classes: Pick<ScheduleResponse, "centerInfoMap"> | null | undefined,
  centerId: number,
): string | null {
  const info = classes?.centerInfoMap ?? {};
  const meta = info[centerId] ?? info[String(centerId)] ?? {};
  return meta.centerName?.trim() || meta.name?.trim() || null;
}

/** Every distinct center in the schedule, enriched with its display name. */
export function listCenters(
  classes: ScheduleResponse | null | undefined,
): { id: number; name: string }[] {
  const centers = new Map<number, { id: number; name: string }>();
  for (const dayId of Object.keys(classes?.classByDateMap ?? {})) {
    for (const { centerId } of iterateClasses(
      classes!.classByDateMap[dayId],
    )) {
      if (!centers.has(centerId)) {
        centers.set(centerId, {
          id: centerId,
          name: getCenterName(classes, centerId) ?? "(name unavailable)",
        });
      }
    }
  }
  return [...centers.values()].sort((a, b) => a.id - b.id);
}

/** Every distinct workout name in the schedule. */
export function listWorkouts(
  classes: ScheduleResponse | null | undefined,
): { id: number; name: string }[] {
  const workouts = new Map<string, { id: number; name: string }>();
  for (const dayId of Object.keys(classes?.classByDateMap ?? {})) {
    for (const { cls } of iterateClasses(classes!.classByDateMap[dayId])) {
      const key = cls.workoutName || String(cls.workoutId);
      if (key && !workouts.has(key)) {
        workouts.set(key, {
          id: cls.workoutId,
          name: cls.workoutName || "(unnamed)",
        });
      }
    }
  }
  return [...workouts.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name)),
  );
}

/** Every distinct time slot in the schedule, optionally for one center. */
export function listSlots(
  classes: ScheduleResponse | null | undefined,
  centerId: number | null = null,
): string[] {
  const slots = new Set<string>();
  for (const dayId of Object.keys(classes?.classByDateMap ?? {})) {
    for (const { timeSlotId } of iterateClasses(
      classes!.classByDateMap[dayId],
      centerId,
    )) {
      slots.add(timeSlotId);
    }
  }
  return [...slots].sort();
}
