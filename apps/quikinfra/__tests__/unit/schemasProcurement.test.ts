import { describe, it, expect } from "vitest";
import {
  prLineSchema,
  prCreateSchema,
  poCreateSchema,
  grnLineSchema,
  grnCreateSchema,
  miCreateSchema,
} from "@/lib/schemas/procurement";

describe("prLineSchema", () => {
  it("requires itemId, positive quantity, uomId", () => {
    expect(prLineSchema.safeParse({ itemId: "i1", quantity: 5, uomId: "u1" }).success).toBe(true);
    expect(prLineSchema.safeParse({ itemId: "i1", quantity: 0, uomId: "u1" }).success).toBe(false);
    expect(prLineSchema.safeParse({ itemId: "", quantity: 5, uomId: "u1" }).success).toBe(false);
  });
});

describe("prCreateSchema", () => {
  const valid = {
    prNumber: "PR-1",
    projectId: "p1",
    requestedById: "u1",
    requestDate: "2025-01-01",
    lines: [{ itemId: "i1", quantity: 5, uomId: "u1" }],
  };
  it("parses a valid PR", () => {
    expect(prCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("requires at least one line", () => {
    expect(prCreateSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
  });
  it("requires a project", () => {
    expect(prCreateSchema.safeParse({ ...valid, projectId: "" }).success).toBe(false);
  });
});

describe("poCreateSchema", () => {
  const valid = {
    poNumber: "PO-1",
    projectId: "p1",
    vendorId: "v1",
    poDate: "2025-01-01",
    lines: [{ itemId: "i1", orderedQty: 10, unitRate: 100, uomId: "u1" }],
  };
  it("parses a valid PO", () => {
    expect(poCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects a non-positive unitRate on a line", () => {
    const bad = { ...valid, lines: [{ ...valid.lines[0], unitRate: 0 }] };
    expect(poCreateSchema.safeParse(bad).success).toBe(false);
  });
});

describe("grnLineSchema defaults", () => {
  it("defaults rejectedQty 0 and qualityStatus accepted", () => {
    const r = grnLineSchema.parse({ itemId: "i1", receivedQty: 5, acceptedQty: 5, uomId: "u1", unitRate: 10 });
    expect(r.rejectedQty).toBe(0);
    expect(r.qualityStatus).toBe("accepted");
  });
  it("rejects a non-positive receivedQty", () => {
    expect(
      grnLineSchema.safeParse({ itemId: "i1", receivedQty: 0, acceptedQty: 0, uomId: "u1", unitRate: 10 }).success,
    ).toBe(false);
  });
});

describe("grnCreateSchema", () => {
  const valid = {
    grnNumber: "GRN-1",
    poId: "po1",
    projectId: "p1",
    vendorId: "v1",
    grnDate: "2025-01-01",
    locationId: "l1",
    receivedById: "u1",
    lines: [{ itemId: "i1", receivedQty: 5, acceptedQty: 5, uomId: "u1", unitRate: 10 }],
  };
  it("parses a valid GRN", () => {
    expect(grnCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("requires locationId", () => {
    expect(grnCreateSchema.safeParse({ ...valid, locationId: "" }).success).toBe(false);
  });
});

describe("miCreateSchema", () => {
  const valid = {
    issueNumber: "MI-1",
    projectId: "p1",
    locationId: "l1",
    issuedToId: "u2",
    issuedById: "u1",
    issueDate: "2025-01-01",
    lines: [{ itemId: "i1", issuedQty: 3, uomId: "u1", unitRate: 5 }],
  };
  it("parses a valid material issue", () => {
    expect(miCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("requires positive issuedQty", () => {
    const bad = { ...valid, lines: [{ ...valid.lines[0], issuedQty: -1 }] };
    expect(miCreateSchema.safeParse(bad).success).toBe(false);
  });
});
