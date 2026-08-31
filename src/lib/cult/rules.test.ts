import { describe, it, expect } from "vitest";
import {
  rulesConfigSchema,
  resolvePreferences,
  collectConfiguredCenters,
  weekdayFor,
  rankMatches,
  prettyTime,
  type RulesConfig,
} from "./rules";
import { getDaySchedule } from "./schedule";
import { scheduleFixture } from "./__fixtures__/schedule";

const baseConfig = (): RulesConfig =>
  rulesConfigSchema.parse({
    version: 1,
    default: {
      centers: [3, 220],
      workouts: ["HRX WORKOUT", "YOGA"],
      slots: ["07:00", "08:00"],
    },
    profiles: {
      weekend: {
        centers: [267, 3],
        workouts: ["DANCE FITNESS", "YOGA"],
        timeRange: "07:00-12:00",
      },
    },
    weekly: {
      wednesday: { profile: "weekend" },
      sunday: { skip: true },
    },
    dates: {
      "2026-09-01": { workouts: ["YOGA"] },
    },
  });

describe("schema validation", () => {
  it("rejects an unknown top-level field", () => {
    expect(
      rulesConfigSchema.safeParse({ version: 1, default: {}, bogus: 1 }).success,
    ).toBe(false);
  });
  it("rejects skip combined with other fields", () => {
    const r = rulesConfigSchema.safeParse({
      version: 1,
      default: { centers: [1], workouts: ["X"], slots: ["07:00"] },
      weekly: { monday: { skip: true, profile: "x" } },
    });
    expect(r.success).toBe(false);
  });
  it("rejects a rule referencing an unknown profile", () => {
    const r = rulesConfigSchema.safeParse({
      version: 1,
      default: { centers: [1], workouts: ["X"], slots: ["07:00"] },
      weekly: { monday: { profile: "ghost" } },
    });
    expect(r.success).toBe(false);
  });
  it("requires default to be complete", () => {
    expect(
      rulesConfigSchema.safeParse({ version: 1, default: { centers: [1] } }).success,
    ).toBe(false);
  });
});

describe("weekdayFor", () => {
  it("is UTC-stable", () => {
    expect(weekdayFor("2026-09-01")).toBe("tuesday");
    expect(weekdayFor("2026-09-02")).toBe("wednesday");
    expect(weekdayFor("2026-09-06")).toBe("sunday");
  });
});

describe("resolvePreferences", () => {
  it("uses default when no rule matches", () => {
    const r = resolvePreferences(baseConfig(), "2026-09-08"); // Tuesday, no rule
    expect(r.skip).toBe(false);
    if (!r.skip) {
      expect(r.source).toBe("default");
      expect(r.preferences.workouts).toEqual(["HRX WORKOUT", "YOGA"]);
    }
  });

  it("a date rule overrides the weekday rule entirely (no merge between them)", () => {
    // 2026-09-01 is Tuesday with a date rule {workouts:["YOGA"]}; there is no
    // Tuesday weekly rule, but the date rule still layers on default only.
    const r = resolvePreferences(baseConfig(), "2026-09-01");
    expect(r.skip).toBe(false);
    if (!r.skip) {
      expect(r.source).toBe("date");
      expect(r.preferences.workouts).toEqual(["YOGA"]); // array replaced, not merged
      expect(r.preferences.centers).toEqual([3, 220]); // inherited from default
    }
  });

  it("applies a weekday profile", () => {
    const r = resolvePreferences(baseConfig(), "2026-09-02"); // Wednesday -> weekend profile
    expect(r.skip).toBe(false);
    if (!r.skip) {
      expect(r.source).toBe("weekday");
      expect(r.profile).toBe("weekend");
      expect(r.preferences.centers).toEqual([267, 3]);
      expect(r.preferences.timeRange).toBe("07:00-12:00");
    }
  });

  it("honours skip", () => {
    expect(resolvePreferences(baseConfig(), "2026-09-06").skip).toBe(true); // Sunday
  });
});

describe("collectConfiguredCenters", () => {
  it("unions default, profiles and rules in order, deduped", () => {
    expect(collectConfiguredCenters(baseConfig())).toEqual([3, 220, 267]);
  });
});

describe("rankMatches", () => {
  const day = getDaySchedule(scheduleFixture, "2026-09-01");

  it("ranks by candidate priority and skips unbookable classes", () => {
    const ranked = rankMatches(scheduleFixture, day, {
      centers: [3, 220],
      workouts: ["HRX WORKOUT", "YOGA"],
      slots: ["07:00", "08:00"],
      enableWaitlist: true,
      selectionOrder: ["times", "centers", "workouts"],
    });
    // top match: 07:00 / center 3 / HRX -> class 1001
    expect(ranked[0].klass.id).toBe("1001");
    expect(ranked[0].reason).toContain("HRX WORKOUT");
    expect(ranked[0].reason).toContain("your top workout");
    // the WAITLIST_AVAILABLE YOGA at 07:00/220 should appear, flagged
    const wl = ranked.find((m) => m.klass.id === "1002");
    expect(wl?.waitlist).toBe(true);
    // no duplicate class ids
    expect(new Set(ranked.map((m) => m.klass.id)).size).toBe(ranked.length);
  });

  it("excludes waitlist matches when disabled", () => {
    const ranked = rankMatches(scheduleFixture, day, {
      centers: [220],
      workouts: ["YOGA"],
      slots: ["07:00"],
      enableWaitlist: false,
      selectionOrder: ["times", "centers", "workouts"],
    });
    expect(ranked.length).toBe(0);
  });
});

describe("prettyTime", () => {
  it("formats 24h to am/pm", () => {
    expect(prettyTime("07:00:00")).toBe("7am");
    expect(prettyTime("18:30:00")).toBe("6:30pm");
    expect(prettyTime("00:00:00")).toBe("12am");
    expect(prettyTime("12:00:00")).toBe("12pm");
  });
});
