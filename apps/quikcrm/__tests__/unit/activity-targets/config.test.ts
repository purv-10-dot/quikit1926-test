/**
 * activity-target-config (OPT-IN model): assignment gating, suggested-default
 * resolution, legacy bare-number migration, sanitization, and sibling-key
 * preservation on write.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import {
  getActivityTargetConfig,
  setActivityTargetConfig,
  isTargetAssigned,
  resolveDailyTarget,
  resolveWeeklyTarget,
  DEFAULT_DAILY_TARGET,
  DEFAULT_WEEKLY_WORKING_DAYS,
  type ActivityTargetConfig,
} from "@/lib/services/workspace/activity-target-config";

const db = mockDb();

beforeEach(() => {
  vi.mocked(db.crmOrgWorkspaceSettings.findUnique).mockReset();
  vi.mocked(db.crmOrgWorkspaceSettings.upsert).mockReset();
  vi.mocked(db.crmOrgWorkspaceSettings.upsert).mockResolvedValue({} as never);
});

describe("getActivityTargetConfig", () => {
  it("returns defaults and NO assignments when no row exists", async () => {
    vi.mocked(db.crmOrgWorkspaceSettings.findUnique).mockResolvedValue(null as never);
    const cfg = await getActivityTargetConfig("t1");
    expect(cfg.defaultDailyTarget).toBe(DEFAULT_DAILY_TARGET);
    expect(cfg.weeklyWorkingDays).toBe(DEFAULT_WEEKLY_WORKING_DAYS);
    expect(cfg.perUser).toEqual({});
  });

  it("reads assignment entries and normalizes enabled/dailyTarget", async () => {
    vi.mocked(db.crmOrgWorkspaceSettings.findUnique).mockResolvedValue({
      settings: {
        activityTargets: {
          defaultDailyTarget: 12,
          weeklyWorkingDays: 6,
          perUser: {
            u1: { enabled: true, dailyTarget: 20 },
            u2: { enabled: true }, // assigned, no explicit target → uses default
            u3: { enabled: false, dailyTarget: 5 }, // disabled but keeps stored value
            u4: { enabled: false }, // meaningless → dropped
            u5: { enabled: true, dailyTarget: -3 }, // invalid target dropped, still enabled
          },
        },
      },
    } as never);
    const cfg = await getActivityTargetConfig("t1");
    expect(cfg.perUser.u1).toEqual({ enabled: true, dailyTarget: 20 });
    expect(cfg.perUser.u2).toEqual({ enabled: true });
    expect(cfg.perUser.u3).toEqual({ enabled: false, dailyTarget: 5 });
    expect(cfg.perUser.u4).toBeUndefined();
    expect(cfg.perUser.u5).toEqual({ enabled: true });
  });

  it("migrates legacy bare-number entries to enabled assignments", async () => {
    vi.mocked(db.crmOrgWorkspaceSettings.findUnique).mockResolvedValue({
      settings: { activityTargets: { defaultDailyTarget: 10, perUser: { old: 25 } } },
    } as never);
    const cfg = await getActivityTargetConfig("t1");
    expect(cfg.perUser.old).toEqual({ enabled: true, dailyTarget: 25 });
  });
});

describe("assignment gating + resolution (opt-in)", () => {
  const cfg: ActivityTargetConfig = {
    defaultDailyTarget: 10,
    weeklyWorkingDays: 5,
    perUser: {
      assignedCustom: { enabled: true, dailyTarget: 25 },
      assignedDefault: { enabled: true },
      disabled: { enabled: false, dailyTarget: 30 },
    },
  };

  it("isTargetAssigned is true ONLY for enabled users", () => {
    expect(isTargetAssigned(cfg, "assignedCustom")).toBe(true);
    expect(isTargetAssigned(cfg, "assignedDefault")).toBe(true);
    expect(isTargetAssigned(cfg, "disabled")).toBe(false);
    expect(isTargetAssigned(cfg, "unknown")).toBe(false); // default = NOT assigned
  });

  it("assigned user with explicit target uses it", () => {
    expect(resolveDailyTarget(cfg, "assignedCustom")).toBe(25);
    expect(resolveWeeklyTarget(cfg, "assignedCustom")).toBe(125);
  });

  it("assigned user without explicit target uses the suggested default", () => {
    expect(resolveDailyTarget(cfg, "assignedDefault")).toBe(10);
    expect(resolveWeeklyTarget(cfg, "assignedDefault")).toBe(50);
  });
});

describe("setActivityTargetConfig", () => {
  it("preserves sibling settings keys on write", async () => {
    vi.mocked(db.crmOrgWorkspaceSettings.findUnique).mockResolvedValue({
      settings: { leadPipelineConfig: { stages: ["New"] }, activityTargets: { defaultDailyTarget: 5 } },
    } as never);

    await setActivityTargetConfig("t1", { defaultDailyTarget: 8 });

    const call = vi.mocked(db.crmOrgWorkspaceSettings.upsert).mock.calls[0][0];
    const written = (call.update as { settings: Record<string, unknown> }).settings;
    expect(written.leadPipelineConfig).toEqual({ stages: ["New"] }); // untouched
    expect((written.activityTargets as { defaultDailyTarget: number }).defaultDailyTarget).toBe(8);
  });

  it("persists per-user assignments through sanitize", async () => {
    vi.mocked(db.crmOrgWorkspaceSettings.findUnique).mockResolvedValue({ settings: {} } as never);
    await setActivityTargetConfig("t1", {
      perUser: { u1: { enabled: true, dailyTarget: 15 }, u2: { enabled: false } },
    });
    const call = vi.mocked(db.crmOrgWorkspaceSettings.upsert).mock.calls[0][0];
    const written = (call.update as unknown as { settings: { activityTargets: ActivityTargetConfig } }).settings;
    expect(written.activityTargets.perUser.u1).toEqual({ enabled: true, dailyTarget: 15 });
    expect(written.activityTargets.perUser.u2).toBeUndefined(); // disabled + no value dropped
  });
});
