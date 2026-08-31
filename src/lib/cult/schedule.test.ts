import { describe, it, expect } from "vitest";
import {
  selectDay,
  getDaySchedule,
  hasExistingBooking,
  findExistingBooking,
  resolveCandidateTimes,
  iterateCandidates,
  findCandidateClass,
  normalizeTime,
  getCenterName,
  listCenters,
  listWorkouts,
  listSlots,
  type Preferences,
} from "./schedule";
import { classesPath } from "./client";
import { scheduleFixture } from "./__fixtures__/schedule";

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  centers: [3, 220],
  workouts: ["HRX WORKOUT", "YOGA"],
  slots: ["07:00", "08:00"],
  enableWaitlist: true,
  selectionOrder: ["times", "centers", "workouts"],
  ...over,
});

describe("normalizeTime", () => {
  it("pads HH:mm to HH:mm:ss", () => {
    expect(normalizeTime("07:00")).toBe("07:00:00");
    expect(normalizeTime("07:30:15")).toBe("07:30:15");
    expect(normalizeTime("nope")).toBeNull();
  });
});

describe("selectDay", () => {
  it("resolves first / last / explicit", () => {
    expect(selectDay(scheduleFixture, "first")).toBe("2026-09-01");
    expect(selectDay(scheduleFixture, "last")).toBe("2026-09-02");
    expect(selectDay(scheduleFixture, "2026-09-01")).toBe("2026-09-01");
    expect(selectDay(scheduleFixture, "2099-01-01")).toBeNull();
    expect(selectDay({ days: [] }, "last")).toBeNull();
  });
});

describe("existing booking detection", () => {
  it("finds a BOOKED class on day 2 but not day 1", () => {
    expect(hasExistingBooking(getDaySchedule(scheduleFixture, "2026-09-01"))).toBe(false);
    expect(hasExistingBooking(getDaySchedule(scheduleFixture, "2026-09-02"))).toBe(true);
    expect(findExistingBooking(getDaySchedule(scheduleFixture, "2026-09-02"))?.cls.id).toBe("2001");
  });
});

describe("resolveCandidateTimes", () => {
  const day = getDaySchedule(scheduleFixture, "2026-09-01")!;
  it("keeps explicit slot order, deduped", () => {
    expect(resolveCandidateTimes(day, { slots: ["08:00", "07:00", "08:00"] })).toEqual([
      "08:00:00",
      "07:00:00",
    ]);
  });
  it("appends live times inside timeRange, chronologically, after slots", () => {
    expect(
      resolveCandidateTimes(day, { slots: ["18:00"], timeRange: "07:00-09:00" }),
    ).toEqual(["18:00:00", "07:00:00", "08:00:00"]);
  });
});

describe("iterateCandidates honours selectionOrder", () => {
  const times = ["07:00:00", "08:00:00"];
  const permutations: Preferences["selectionOrder"][] = [
    ["times", "centers", "workouts"],
    ["times", "workouts", "centers"],
    ["centers", "times", "workouts"],
    ["centers", "workouts", "times"],
    ["workouts", "times", "centers"],
    ["workouts", "centers", "times"],
  ];
  for (const order of permutations) {
    it(order.join(">"), () => {
      const combos = [...iterateCandidates(prefs({ selectionOrder: order }), times)];
      // 2 times * 2 centers * 2 workouts
      expect(combos).toHaveLength(8);
      // outermost dimension changes slowest
      const outer = order[0];
      const firstHalf = combos.slice(0, 4);
      if (outer === "times")
        expect(new Set(firstHalf.map((c) => c.slot)).size).toBe(1);
      if (outer === "centers")
        expect(new Set(firstHalf.map((c) => c.centerId)).size).toBe(1);
      if (outer === "workouts")
        expect(new Set(firstHalf.map((c) => c.workout)).size).toBe(1);
    });
  }
});

describe("findCandidateClass", () => {
  const day = getDaySchedule(scheduleFixture, "2026-09-01")!;
  it("matches an AVAILABLE class by exact workout name", () => {
    const c = findCandidateClass(
      day,
      { slot: "07:00:00", centerId: 3, workout: "HRX WORKOUT" },
      true,
    );
    expect(c?.id).toBe("1001");
  });
  it("is case-sensitive on workout name", () => {
    expect(
      findCandidateClass(day, { slot: "07:00:00", centerId: 3, workout: "hrx workout" }, true),
    ).toBeNull();
  });
  it("includes WAITLIST_AVAILABLE only when waitlist is enabled", () => {
    const cand = { slot: "07:00:00", centerId: 220, workout: "YOGA" };
    expect(findCandidateClass(day, cand, true)?.id).toBe("1002");
    expect(findCandidateClass(day, cand, false)).toBeNull();
  });
  it("never matches SEAT_NOT_AVAILABLE or WAITLIST_FULL", () => {
    expect(
      findCandidateClass(day, { slot: "08:00:00", centerId: 3, workout: "YOGA" }, true),
    ).toBeNull();
    expect(
      findCandidateClass(day, { slot: "08:00:00", centerId: 267, workout: "DANCE FITNESS" }, true),
    ).toBeNull();
  });
});

describe("directory helpers", () => {
  it("getCenterName trims trailing space", () => {
    expect(getCenterName(scheduleFixture, 220)).toBe("Cult HSR 24th Main");
  });
  it("lists centers, workouts, slots from the schedule", () => {
    expect(listCenters(scheduleFixture).map((c) => c.id)).toEqual([3, 220, 267]);
    expect(listWorkouts(scheduleFixture).map((w) => w.name)).toEqual([
      "DANCE FITNESS",
      "HRX WORKOUT",
      "YOGA",
    ]);
    expect(listSlots(scheduleFixture)).toEqual(["07:00:00", "08:00:00", "18:00:00"]);
  });
});

describe("classesPath", () => {
  it("joins center ids with a literal comma, unencoded", () => {
    const p = classesPath([3, 220, 5]);
    expect(p).toBe("/api/cult/classes/v2?productType=FITNESS&centerId=3,220,5");
    expect(p).not.toContain("%2C");
  });
  it("drops the param entirely when no centers given", () => {
    expect(classesPath()).toBe("/api/cult/classes/v2?productType=FITNESS");
    expect(classesPath([0, -1, 2.5])).toBe("/api/cult/classes/v2?productType=FITNESS");
  });
  it("dedupes", () => {
    expect(classesPath([3, 3, 220])).toBe(
      "/api/cult/classes/v2?productType=FITNESS&centerId=3,220",
    );
  });
});
