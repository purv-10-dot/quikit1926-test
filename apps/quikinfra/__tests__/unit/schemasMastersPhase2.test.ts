import { describe, it, expect } from "vitest";
import {
  bankCreateSchema,
  departmentCreateSchema,
  locationCreateSchema,
  gstCodeCreateSchema,
  tdsCodeCreateSchema,
  termsCreateSchema,
  financialYearCreateSchema,
  projectCreateSchema,
  machineryCreateSchema,
  assetCreateSchema,
} from "@/lib/schemas/masters-phase2";

describe("bankCreateSchema", () => {
  const valid = { companyId: "c1", bankName: "SBI", accountNo: "12345", ifscCode: "SBIN0001234" };
  it("parses valid + defaults accountType to current", () => {
    const r = bankCreateSchema.parse(valid);
    expect(r.accountType).toBe("current");
    expect(r.status).toBe("active");
  });
  it("requires ifscCode of exactly 11 chars", () => {
    expect(bankCreateSchema.safeParse({ ...valid, ifscCode: "SBIN001" }).success).toBe(false);
  });
  it("requires companyId", () => {
    expect(bankCreateSchema.safeParse({ ...valid, companyId: "" }).success).toBe(false);
  });
});

describe("departmentCreateSchema", () => {
  it("requires code+name", () => {
    expect(departmentCreateSchema.safeParse({ code: "D1", name: "Civil" }).success).toBe(true);
    expect(departmentCreateSchema.safeParse({ code: "D1" }).success).toBe(false);
  });
});

describe("locationCreateSchema", () => {
  it("requires a valid type enum", () => {
    expect(locationCreateSchema.safeParse({ code: "L1", name: "Yard", type: "yard" }).success).toBe(true);
    expect(locationCreateSchema.safeParse({ code: "L1", name: "Yard", type: "moon" }).success).toBe(false);
  });
  it("requires type (no default)", () => {
    expect(locationCreateSchema.safeParse({ code: "L1", name: "Yard" }).success).toBe(false);
  });
});

describe("gstCodeCreateSchema / tdsCodeCreateSchema", () => {
  it("gst requires rate fields within 0..100", () => {
    const ok = { code: "G1", description: "GST 18", rate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18 };
    expect(gstCodeCreateSchema.safeParse(ok).success).toBe(true);
    expect(gstCodeCreateSchema.safeParse({ ...ok, rate: 200 }).success).toBe(false);
  });
  it("tds requires section+description+rate", () => {
    expect(tdsCodeCreateSchema.safeParse({ section: "194C", description: "Contractor", rate: 2 }).success).toBe(true);
    expect(tdsCodeCreateSchema.safeParse({ section: "194C", rate: 2 }).success).toBe(false);
  });
});

describe("termsCreateSchema", () => {
  it("defaults isDefault false and validates applicableTo enum", () => {
    const r = termsCreateSchema.parse({ title: "T", body: "B", applicableTo: "po" });
    expect(r.isDefault).toBe(false);
  });
  it("rejects bad applicableTo", () => {
    expect(termsCreateSchema.safeParse({ title: "T", body: "B", applicableTo: "xx" }).success).toBe(false);
  });
});

describe("financialYearCreateSchema refinement", () => {
  const base = { companyId: "c1", label: "FY 2025-26", startDate: "2025-04-01", endDate: "2026-03-31" };
  it("accepts endDate after startDate", () => {
    expect(financialYearCreateSchema.safeParse(base).success).toBe(true);
  });
  it("rejects endDate not after startDate", () => {
    const r = financialYearCreateSchema.safeParse({ ...base, endDate: "2025-01-01" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("endDate"))).toBe(true);
    }
  });
});

describe("projectCreateSchema", () => {
  const valid = { code: "P1", name: "Bridge", companyId: "c1" };
  it("parses valid and supports on-hold status", () => {
    expect(projectCreateSchema.safeParse(valid).success).toBe(true);
    expect(projectCreateSchema.parse({ ...valid, status: "on-hold" }).status).toBe("on-hold");
  });
  it("requires companyId", () => {
    expect(projectCreateSchema.safeParse({ code: "P1", name: "Bridge" }).success).toBe(false);
  });
});

describe("machineryCreateSchema / assetCreateSchema", () => {
  it("machinery requires code/name/type", () => {
    expect(machineryCreateSchema.safeParse({ code: "M1", name: "Crane", type: "lifting" }).success).toBe(true);
    expect(machineryCreateSchema.safeParse({ code: "M1", name: "Crane" }).success).toBe(false);
  });
  it("asset requires code+name and supports disposed status", () => {
    expect(assetCreateSchema.parse({ code: "A1", name: "Drill", status: "disposed" }).status).toBe("disposed");
    expect(assetCreateSchema.safeParse({ name: "Drill" }).success).toBe(false);
  });
});
