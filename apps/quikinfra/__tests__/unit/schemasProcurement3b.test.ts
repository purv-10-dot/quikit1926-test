import { describe, it, expect } from "vitest";
import {
  indentCreateSchema,
  rfqCreateSchema,
  gatePassCreateSchema,
  goodReturnCreateSchema,
  internalReturnCreateSchema,
  transferCreateSchema,
  reconCreateSchema,
  dieselCreateSchema,
} from "@/lib/schemas/procurement-3b";

describe("indentCreateSchema", () => {
  const valid = {
    indentNumber: "IND-1",
    projectId: "p1",
    requestedById: "u1",
    requestDate: "2025-01-01",
    lines: [{ itemId: "i1", quantity: 5, uomId: "u1" }],
  };
  it("parses valid", () => {
    expect(indentCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("requires at least one line", () => {
    expect(indentCreateSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
  });
});

describe("rfqCreateSchema", () => {
  const valid = {
    rfqNumber: "RFQ-1",
    projectId: "p1",
    rfqDate: "2025-01-01",
    lines: [{ itemId: "i1", quantity: 5, uomId: "u1" }],
    vendorIds: ["v1"],
  };
  it("parses valid", () => {
    expect(rfqCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("requires at least one vendor", () => {
    expect(rfqCreateSchema.safeParse({ ...valid, vendorIds: [] }).success).toBe(false);
  });
});

describe("gatePassCreateSchema", () => {
  const valid = {
    gatePassNumber: "GP-1",
    projectId: "p1",
    locationId: "l1",
    type: "inward",
    gatePassDate: "2025-01-01",
  };
  it("parses valid type enum", () => {
    expect(gatePassCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects an invalid type", () => {
    expect(gatePassCreateSchema.safeParse({ ...valid, type: "sideways" }).success).toBe(false);
  });
});

describe("goodReturnCreateSchema / internalReturnCreateSchema", () => {
  it("good return requires grnId + lines", () => {
    const valid = {
      returnNumber: "GR-1",
      grnId: "g1",
      projectId: "p1",
      vendorId: "v1",
      locationId: "l1",
      returnDate: "2025-01-01",
      lines: [{ itemId: "i1", returnQty: 2, uomId: "u1", unitRate: 10 }],
    };
    expect(goodReturnCreateSchema.safeParse(valid).success).toBe(true);
    expect(goodReturnCreateSchema.safeParse({ ...valid, grnId: "" }).success).toBe(false);
  });
  it("internal return requires issueId + returnedBy", () => {
    const valid = {
      returnNumber: "IR-1",
      issueId: "mi1",
      projectId: "p1",
      locationId: "l1",
      returnDate: "2025-01-01",
      returnedBy: "u1",
      lines: [{ itemId: "i1", returnQty: 2, uomId: "u1", unitRate: 10 }],
    };
    expect(internalReturnCreateSchema.safeParse(valid).success).toBe(true);
    expect(internalReturnCreateSchema.safeParse({ ...valid, returnedBy: "" }).success).toBe(false);
  });
});

describe("transferCreateSchema refinement", () => {
  const valid = {
    transferNumber: "TR-1",
    projectId: "p1",
    fromLocationId: "l1",
    toLocationId: "l2",
    transferDate: "2025-01-01",
    lines: [{ itemId: "i1", quantity: 2, uomId: "u1", unitRate: 10 }],
  };
  it("accepts distinct from/to locations", () => {
    expect(transferCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects same from/to location", () => {
    const r = transferCreateSchema.safeParse({ ...valid, toLocationId: "l1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes("toLocationId"))).toBe(true);
  });
});

describe("reconCreateSchema", () => {
  it("allows negative system/physical qty (just numbers)", () => {
    const valid = {
      reconciliationNumber: "RC-1",
      projectId: "p1",
      locationId: "l1",
      reconciliationDate: "2025-01-01",
      lines: [{ itemId: "i1", systemQty: 5, physicalQty: -1, uomId: "u1", unitRate: 10 }],
    };
    expect(reconCreateSchema.safeParse(valid).success).toBe(true);
  });
});

describe("dieselCreateSchema", () => {
  const valid = {
    logNumber: "DL-1",
    projectId: "p1",
    locationId: "l1",
    logDate: "2025-01-01",
    fuelQty: 50,
  };
  it("parses valid", () => {
    expect(dieselCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("requires a positive fuelQty", () => {
    expect(dieselCreateSchema.safeParse({ ...valid, fuelQty: 0 }).success).toBe(false);
  });
});
