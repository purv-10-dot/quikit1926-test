/**
 * Batch validation tests for all Zod schemas that had 0% coverage.
 *
 * Phase 1.9: covers categorySchema, huddleSchema, opspSchema, orgSchema,
 * prioritySchema, quarterSchema, settingsSchema, tablePreferencesSchema,
 * teamSchema, teamMembersSchema, wwwSchema.
 *
 * Pattern: test the happy path + 2-3 key rejection cases per schema.
 * Not exhaustive — just enough to prove every schema is wired and functional.
 */

import { describe, it, expect } from "vitest";

import { createCategorySchema, updateCategorySchema } from "@/lib/schemas/categorySchema";
import { createHuddleSchema } from "@/lib/schemas/huddleSchema";
import { opspUpsertSchema } from "@/lib/schemas/opspSchema";
import { selectOrgSchema, invitationActionSchema } from "@/lib/schemas/orgSchema";
import { createPrioritySchema, updatePrioritySchema } from "@/lib/schemas/prioritySchema";
import { generateQuartersSchema, updateQuarterSchema } from "@/lib/schemas/quarterSchema";
import { updateProfileSchema, updateCompanySchema } from "@/lib/schemas/settingsSchema";
import { updateTablePreferencesSchema } from "@/lib/schemas/tablePreferencesSchema";
import { createTeamSchema, updateTeamSchema } from "@/lib/schemas/teamSchema";
import { addTeamMembersSchema } from "@/lib/schemas/teamMembersSchema";
import { createWWWSchema, updateWWWSchema } from "@/lib/schemas/wwwSchema";

/* ── categorySchema ── */

describe("categorySchema", () => {
  it("accepts a valid category", () => {
    expect(createCategorySchema.safeParse({ name: "Revenue", dataType: "Currency", currency: "USD" }).success).toBe(true);
  });
  it("requires name", () => {
    expect(createCategorySchema.safeParse({ dataType: "Number" }).success).toBe(false);
  });
  it("rejects invalid dataType", () => {
    expect(createCategorySchema.safeParse({ name: "x", dataType: "Boolean" }).success).toBe(false);
  });
  it("accepts partial update", () => {
    expect(updateCategorySchema.safeParse({ name: "Renamed" }).success).toBe(true);
    expect(updateCategorySchema.safeParse({}).success).toBe(true);
  });
});

/* ── huddleSchema ── */

describe("huddleSchema", () => {
  const base = {
    meetingDate: "2026-04-15T00:00:00.000Z",
    callStatus: "Held",
  };
  it("accepts a valid huddle", () => {
    expect(createHuddleSchema.safeParse(base).success).toBe(true);
  });
  it("requires meetingDate", () => {
    expect(createHuddleSchema.safeParse({ callStatus: "Held" }).success).toBe(false);
  });
  it("requires callStatus", () => {
    expect(createHuddleSchema.safeParse({ meetingDate: "2026-04-15T00:00:00.000Z" }).success).toBe(false);
  });
});

/* ── opspSchema ── */

describe("opspSchema", () => {
  const base = { year: 2026, quarter: "Q1" };
  it("accepts minimal OPSP upsert", () => {
    expect(opspUpsertSchema.safeParse(base).success).toBe(true);
  });
  it("rejects invalid quarter", () => {
    expect(opspUpsertSchema.safeParse({ year: 2026, quarter: "Q5" }).success).toBe(false);
  });
  it("accepts targetYears override", () => {
    expect(opspUpsertSchema.safeParse({ ...base, targetYears: 3 }).success).toBe(true);
  });
});

/* ── orgSchema ── */

describe("orgSchema", () => {
  it("selectOrg requires tenantId", () => {
    expect(selectOrgSchema.safeParse({ tenantId: "t1" }).success).toBe(true);
    expect(selectOrgSchema.safeParse({}).success).toBe(false);
  });
  it("invitationAction requires membershipId + action", () => {
    expect(invitationActionSchema.safeParse({ membershipId: "m1", action: "accept" }).success).toBe(true);
    expect(invitationActionSchema.safeParse({ membershipId: "m1", action: "reject" }).success).toBe(false);
  });
  it("invitationAction accepts decline", () => {
    expect(invitationActionSchema.safeParse({ membershipId: "m1", action: "decline" }).success).toBe(true);
  });
});

/* ── prioritySchema ── */

describe("prioritySchema", () => {
  const base = {
    name: "Ship v2",
    owner: "u1",
    quarter: "Q1",
    year: 2026,
  };
  it("accepts a valid priority", () => {
    expect(createPrioritySchema.safeParse(base).success).toBe(true);
  });
  it("defaults overallStatus to not-yet-started", () => {
    const r = createPrioritySchema.safeParse(base);
    if (r.success) expect(r.data.overallStatus).toBe("not-yet-started");
  });
  it("requires name", () => {
    expect(createPrioritySchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });
  it("rejects invalid quarter", () => {
    expect(createPrioritySchema.safeParse({ ...base, quarter: "Q5" }).success).toBe(false);
  });
  it("accepts partial update", () => {
    expect(updatePrioritySchema.safeParse({ name: "Renamed" }).success).toBe(true);
    expect(updatePrioritySchema.safeParse({}).success).toBe(true);
  });
});

/* ── quarterSchema ── */

describe("quarterSchema", () => {
  it("generateQuarters requires fiscalYear", () => {
    expect(generateQuartersSchema.safeParse({ fiscalYear: 2026 }).success).toBe(true);
    expect(generateQuartersSchema.safeParse({}).success).toBe(false);
  });
  it("updateQuarter accepts startDate", () => {
    expect(updateQuarterSchema.safeParse({ startDate: "2026-04-01" }).success).toBe(true);
  });
});

/* ── settingsSchema ── */

describe("settingsSchema", () => {
  it("updateProfile accepts name fields", () => {
    expect(updateProfileSchema.safeParse({ firstName: "Alice", lastName: "Admin" }).success).toBe(true);
  });
  it("updateProfile accepts empty object", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(true);
  });
  it("updateCompany accepts themeMode", () => {
    expect(updateCompanySchema.safeParse({ themeMode: "dark" }).success).toBe(true);
  });
  it("updateCompany rejects invalid themeMode", () => {
    expect(updateCompanySchema.safeParse({ themeMode: "neon" }).success).toBe(false);
  });
});

/* ── tablePreferencesSchema ── */

describe("tablePreferencesSchema", () => {
  it("accepts valid table + frozenCol", () => {
    expect(updateTablePreferencesSchema.safeParse({ table: "kpi", frozenCol: "owner" }).success).toBe(true);
  });
  it("rejects unknown table", () => {
    expect(updateTablePreferencesSchema.safeParse({ table: "meetings" }).success).toBe(false);
  });
  it("accepts hiddenCols array", () => {
    expect(updateTablePreferencesSchema.safeParse({ table: "priority", hiddenCols: ["team", "owner"] }).success).toBe(true);
  });
});

/* ── teamSchema ── */

describe("teamSchema", () => {
  it("createTeam requires name", () => {
    expect(createTeamSchema.safeParse({ name: "Engineering" }).success).toBe(true);
    expect(createTeamSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("updateTeam accepts partial", () => {
    expect(updateTeamSchema.safeParse({ description: "Updated desc" }).success).toBe(true);
    expect(updateTeamSchema.safeParse({}).success).toBe(true);
  });
});

/* ── teamMembersSchema ── */

describe("teamMembersSchema", () => {
  it("requires userIds array", () => {
    expect(addTeamMembersSchema.safeParse({ userIds: ["u1", "u2"] }).success).toBe(true);
  });
  it("rejects empty userIds", () => {
    expect(addTeamMembersSchema.safeParse({ userIds: [] }).success).toBe(false);
  });
  it("rejects missing userIds", () => {
    expect(addTeamMembersSchema.safeParse({}).success).toBe(false);
  });
});

/* ── wwwSchema ── */

describe("wwwSchema", () => {
  const base = {
    who: "u1",
    what: "Fix the deploy pipeline",
    when: "2026-04-20",
  };
  it("accepts a valid WWW item", () => {
    expect(createWWWSchema.safeParse(base).success).toBe(true);
  });
  it("defaults status to not-yet-started", () => {
    const r = createWWWSchema.safeParse(base);
    if (r.success) expect(r.data.status).toBe("not-yet-started");
  });
  it("requires who + what + when", () => {
    expect(createWWWSchema.safeParse({ what: "x", when: "2026-04-20" }).success).toBe(false);
    expect(createWWWSchema.safeParse({ who: "u1", when: "2026-04-20" }).success).toBe(false);
    expect(createWWWSchema.safeParse({ who: "u1", what: "x" }).success).toBe(false);
  });
  it("rejects invalid status", () => {
    expect(createWWWSchema.safeParse({ ...base, status: "done" }).success).toBe(false);
  });
  it("accepts valid statuses", () => {
    for (const s of ["not-yet-started", "in-progress", "completed", "blocked", "not-applicable"]) {
      expect(createWWWSchema.safeParse({ ...base, status: s }).success).toBe(true);
    }
  });
  it("accepts partial update", () => {
    expect(updateWWWSchema.safeParse({ what: "Updated task" }).success).toBe(true);
    expect(updateWWWSchema.safeParse({}).success).toBe(true);
  });
});
