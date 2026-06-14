import { describe, it, expect } from "vitest";
import {
  estimationCreateSchema,
  woCreateSchema,
  rabLineInputSchema,
  rabCreateSchema,
} from "@/lib/schemas/projects-4b";

describe("estimationCreateSchema", () => {
  const valid = {
    estimationNumber: "EST-1",
    projectId: "p1",
    estimationDate: "2025-01-01",
    items: [{ description: "Steel" }],
  };
  it("parses valid + defaults currency INR", () => {
    expect(estimationCreateSchema.parse(valid).currency).toBe("INR");
  });
  it("requires at least one item", () => {
    expect(estimationCreateSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
  });
});

describe("woCreateSchema", () => {
  const valid = {
    woNumber: "WO-1",
    projectId: "p1",
    contractorId: "c1",
    woDate: "2025-01-01",
    lines: [{ description: "Masonry", quantity: 10, rate: 50 }],
  };
  it("parses valid", () => {
    expect(woCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("requires contractorId", () => {
    expect(woCreateSchema.safeParse({ ...valid, contractorId: "" }).success).toBe(false);
  });
  it("rejects a non-positive line quantity", () => {
    const bad = { ...valid, lines: [{ description: "x", quantity: 0, rate: 50 }] };
    expect(woCreateSchema.safeParse(bad).success).toBe(false);
  });
});

describe("rabLineInputSchema", () => {
  it("requires boqItemId and non-negative cumulativeQtyDone", () => {
    expect(rabLineInputSchema.safeParse({ boqItemId: "b1", cumulativeQtyDone: 0 }).success).toBe(true);
    expect(rabLineInputSchema.safeParse({ boqItemId: "b1", cumulativeQtyDone: -1 }).success).toBe(false);
    expect(rabLineInputSchema.safeParse({ boqItemId: "", cumulativeQtyDone: 5 }).success).toBe(false);
  });
});

describe("rabCreateSchema", () => {
  const valid = {
    rabNumber: "RAB-1",
    projectId: "p1",
    boqId: "boq1",
    rabDate: "2025-01-01",
    billedTillDate: "2025-01-31",
    lines: [{ boqItemId: "b1", cumulativeQtyDone: 10 }],
  };
  it("parses valid", () => {
    expect(rabCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("requires boqId and at least one line", () => {
    expect(rabCreateSchema.safeParse({ ...valid, boqId: "" }).success).toBe(false);
    expect(rabCreateSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
  });
});
