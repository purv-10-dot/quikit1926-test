import { describe, it, expect } from "vitest";
import {
  createGoalSchema,
  updateGoalSchema,
  GOAL_STATUSES,
} from "@/lib/schemas/goalSchema";
import {
  createOneOnOneSchema,
  updateOneOnOneSchema,
  MOOD_VALUES,
} from "@/lib/schemas/oneOnOneSchema";
import {
  createFeedbackSchema,
  FEEDBACK_CATEGORIES,
  FEEDBACK_VISIBILITIES,
} from "@/lib/schemas/feedbackSchema";

const CUID_A = "ckuser0000000000000000000a";
const CUID_B = "ckuser0000000000000000000b";

/* ──────────────── Goal ──────────────── */

describe("createGoalSchema", () => {
  const base = {
    title: "Launch v2",
    ownerId: CUID_A,
    year: 2026,
  };

  it("accepts a minimal valid goal", () => {
    expect(createGoalSchema.safeParse(base).success).toBe(true);
  });

  it("requires title", () => {
    expect(createGoalSchema.safeParse({ ...base, title: "" }).success).toBe(false);
  });

  it("requires valid ownerId cuid", () => {
    expect(
      createGoalSchema.safeParse({ ...base, ownerId: "not-a-cuid" }).success,
    ).toBe(false);
  });

  it("accepts every valid status", () => {
    for (const s of GOAL_STATUSES) {
      expect(createGoalSchema.safeParse({ ...base, status: s }).success).toBe(true);
    }
  });

  it("defaults status to draft", () => {
    const r = createGoalSchema.safeParse(base);
    if (r.success) expect(r.data.status).toBe("draft");
  });

  it("rejects year out of bounds", () => {
    expect(createGoalSchema.safeParse({ ...base, year: 1999 }).success).toBe(false);
    expect(createGoalSchema.safeParse({ ...base, year: 2101 }).success).toBe(false);
  });

  it("accepts optional parentGoalId as cuid or null", () => {
    expect(
      createGoalSchema.safeParse({ ...base, parentGoalId: CUID_B }).success,
    ).toBe(true);
    expect(
      createGoalSchema.safeParse({ ...base, parentGoalId: null }).success,
    ).toBe(true);
  });

  it("rejects parentGoalId that is not a cuid", () => {
    expect(
      createGoalSchema.safeParse({ ...base, parentGoalId: "xxx" }).success,
    ).toBe(false);
  });
});

describe("updateGoalSchema", () => {
  it("accepts empty partial", () => {
    expect(updateGoalSchema.safeParse({}).success).toBe(true);
  });
  it("accepts status-only update", () => {
    expect(updateGoalSchema.safeParse({ status: "completed" }).success).toBe(true);
  });
});

/* ──────────────── OneOnOne ──────────────── */

describe("createOneOnOneSchema", () => {
  const base = {
    managerId: CUID_A,
    reportId: CUID_B,
    scheduledAt: "2026-04-15T14:00:00.000Z",
  };

  it("accepts a minimal valid session", () => {
    expect(createOneOnOneSchema.safeParse(base).success).toBe(true);
  });

  it("defaults duration to 30", () => {
    const r = createOneOnOneSchema.safeParse(base);
    if (r.success) expect(r.data.duration).toBe(30);
  });

  it("requires ISO datetime for scheduledAt", () => {
    expect(
      createOneOnOneSchema.safeParse({ ...base, scheduledAt: "tomorrow" }).success,
    ).toBe(false);
  });

  it("requires manager/report cuids", () => {
    expect(
      createOneOnOneSchema.safeParse({ ...base, managerId: "x" }).success,
    ).toBe(false);
    expect(
      createOneOnOneSchema.safeParse({ ...base, reportId: "x" }).success,
    ).toBe(false);
  });
});

describe("updateOneOnOneSchema", () => {
  it("accepts mood values", () => {
    for (const m of MOOD_VALUES) {
      expect(updateOneOnOneSchema.safeParse({ mood: m }).success).toBe(true);
    }
  });
  it("rejects invalid mood", () => {
    expect(updateOneOnOneSchema.safeParse({ mood: "blue" }).success).toBe(false);
  });
  it("accepts completedAt as null", () => {
    expect(updateOneOnOneSchema.safeParse({ completedAt: null }).success).toBe(true);
  });
});

/* ──────────────── Feedback ──────────────── */

describe("createFeedbackSchema", () => {
  const base = {
    toUserId: CUID_A,
    category: "kudos" as const,
    content: "Great job shipping v2",
  };

  it("accepts a minimal valid entry", () => {
    expect(createFeedbackSchema.safeParse(base).success).toBe(true);
  });

  it("defaults visibility to private", () => {
    const r = createFeedbackSchema.safeParse(base);
    if (r.success) expect(r.data.visibility).toBe("private");
  });

  it("accepts every category", () => {
    for (const c of FEEDBACK_CATEGORIES) {
      expect(createFeedbackSchema.safeParse({ ...base, category: c }).success).toBe(
        true,
      );
    }
  });

  it("accepts every visibility", () => {
    for (const v of FEEDBACK_VISIBILITIES) {
      expect(
        createFeedbackSchema.safeParse({ ...base, visibility: v }).success,
      ).toBe(true);
    }
  });

  it("rejects empty content", () => {
    expect(createFeedbackSchema.safeParse({ ...base, content: "" }).success).toBe(
      false,
    );
    expect(
      createFeedbackSchema.safeParse({ ...base, content: "   " }).success,
    ).toBe(false);
  });

  it("rejects content longer than 5000 chars", () => {
    expect(
      createFeedbackSchema.safeParse({ ...base, content: "x".repeat(5001) }).success,
    ).toBe(false);
  });

  it("rejects non-cuid toUserId", () => {
    expect(
      createFeedbackSchema.safeParse({ ...base, toUserId: "xxx" }).success,
    ).toBe(false);
  });
});
