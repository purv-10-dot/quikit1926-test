import { describe, it, expect } from "vitest";
import {
  boqItemSchema,
  boqCreateSchema,
  dprCreateSchema,
  hindranceCreateSchema,
} from "@/lib/schemas/projects";

describe("boqItemSchema", () => {
  it("defaults sortOrder 0 and kind item", () => {
    const r = boqItemSchema.parse({ description: "Excavation" });
    expect(r.sortOrder).toBe(0);
    expect(r.kind).toBe("item");
  });
  it("requires a description", () => {
    expect(boqItemSchema.safeParse({}).success).toBe(false);
  });
  it("rejects a non-positive quantity", () => {
    expect(boqItemSchema.safeParse({ description: "x", quantity: 0 }).success).toBe(false);
  });
});

describe("boqCreateSchema", () => {
  const valid = {
    boqNumber: "BOQ-1",
    projectId: "p1",
    boqDate: "2025-01-01",
    items: [{ description: "Excavation" }],
  };
  it("parses valid and defaults currency INR", () => {
    const r = boqCreateSchema.parse(valid);
    expect(r.currency).toBe("INR");
  });
  it("requires at least one item", () => {
    expect(boqCreateSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
  });
});

describe("dprCreateSchema", () => {
  const valid = {
    projectId: "p1",
    dprDate: "2025-01-01",
    reportedById: "u1",
    lines: [{ activity: "Pour concrete", quantityDone: 10 }],
  };
  it("parses valid", () => {
    expect(dprCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("requires reportedById", () => {
    expect(dprCreateSchema.safeParse({ ...valid, reportedById: "" }).success).toBe(false);
  });
  it("rejects negative quantityDone", () => {
    const bad = { ...valid, lines: [{ activity: "x", quantityDone: -1 }] };
    expect(dprCreateSchema.safeParse(bad).success).toBe(false);
  });
});

describe("hindranceCreateSchema refinement", () => {
  const valid = {
    projectId: "p1",
    hindranceDate: "2025-01-01",
    category: "weather",
    title: "Rain delay",
    startDate: "2025-01-01",
    endDate: "2025-01-05",
  };
  it("accepts endDate on/after startDate", () => {
    expect(hindranceCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("accepts a missing endDate", () => {
    const { endDate, ...rest } = valid;
    expect(hindranceCreateSchema.safeParse(rest).success).toBe(true);
  });
  it("rejects endDate before startDate", () => {
    const r = hindranceCreateSchema.safeParse({ ...valid, endDate: "2024-12-01" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes("endDate"))).toBe(true);
  });
  it("rejects an invalid category enum", () => {
    expect(hindranceCreateSchema.safeParse({ ...valid, category: "alien_invasion" }).success).toBe(false);
  });
});
