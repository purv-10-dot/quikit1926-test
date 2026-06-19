import { describe, it, expect } from "vitest";
import {
  companyCreateSchema,
  companyUpdateSchema,
  vendorCreateSchema,
  customerCreateSchema,
  contractorCreateSchema,
  uomCreateSchema,
  itemGroupCreateSchema,
  itemCreateSchema,
} from "@/lib/schemas/masters";

describe("companyCreateSchema", () => {
  const valid = {
    name: "Acme",
    legalName: "Acme Pvt Ltd",
    gstin: "22AAAAA0000A1Z5",
    pan: "ABCDE1234F",
    address: "1 Main St",
    city: "Indore",
    state: "MP",
    pincode: "452001",
  };

  it("parses a minimal valid company and applies the status default", () => {
    const r = companyCreateSchema.parse(valid);
    expect(r.status).toBe("active");
  });

  it("rejects a GSTIN that isn't 15 chars", () => {
    expect(companyCreateSchema.safeParse({ ...valid, gstin: "TOOSHORT" }).success).toBe(false);
  });

  it("rejects a PAN that isn't exactly 10 chars", () => {
    expect(companyCreateSchema.safeParse({ ...valid, pan: "ABCDE1234" }).success).toBe(false);
  });

  it("fails when a required field is missing", () => {
    const { name, ...rest } = valid;
    expect(companyCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("transforms an empty email string to null", () => {
    const r = companyCreateSchema.parse({ ...valid, email: "" });
    expect(r.email).toBeNull();
  });

  it("rejects a malformed email", () => {
    expect(companyCreateSchema.safeParse({ ...valid, email: "not-email" }).success).toBe(false);
  });

  it("companyUpdateSchema (partial) accepts an empty object", () => {
    expect(companyUpdateSchema.safeParse({}).success).toBe(true);
  });
});

describe("vendorCreateSchema", () => {
  it("parses with just code+name and defaults status to active", () => {
    const r = vendorCreateSchema.parse({ code: "V1", name: "Vendor One" });
    expect(r.status).toBe("active");
  });

  it("requires code", () => {
    expect(vendorCreateSchema.safeParse({ name: "Vendor One" }).success).toBe(false);
  });

  it("rejects a rating outside 1..5", () => {
    expect(vendorCreateSchema.safeParse({ code: "V1", name: "x", rating: 6 }).success).toBe(false);
  });

  it("allows the blacklisted status enum value", () => {
    const r = vendorCreateSchema.parse({ code: "V1", name: "x", status: "blacklisted" });
    expect(r.status).toBe("blacklisted");
  });
});

describe("customerCreateSchema / contractorCreateSchema / uomCreateSchema", () => {
  it("customer requires code+name", () => {
    expect(customerCreateSchema.safeParse({ code: "C1", name: "Cust" }).success).toBe(true);
    expect(customerCreateSchema.safeParse({ name: "Cust" }).success).toBe(false);
  });
  it("contractor requires code+name", () => {
    expect(contractorCreateSchema.safeParse({ code: "K1", name: "Ctr" }).success).toBe(true);
    expect(contractorCreateSchema.safeParse({ code: "" }).success).toBe(false);
  });
  it("uom requires code+name", () => {
    expect(uomCreateSchema.safeParse({ code: "KG", name: "Kilogram" }).success).toBe(true);
  });
});

describe("itemGroupCreateSchema", () => {
  it("defaults sortOrder to 0 and status to active", () => {
    const r = itemGroupCreateSchema.parse({ name: "Cement" });
    expect(r.sortOrder).toBe(0);
    expect(r.status).toBe("active");
  });
  it("rejects a negative sortOrder", () => {
    expect(itemGroupCreateSchema.safeParse({ name: "x", sortOrder: -1 }).success).toBe(false);
  });
});

describe("itemCreateSchema", () => {
  const valid = { code: "I1", name: "Item", groupId: "g1", uomId: "u1" };
  it("parses with required code/name/groupId/uomId", () => {
    expect(itemCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("requires groupId and uomId", () => {
    expect(itemCreateSchema.safeParse({ ...valid, groupId: "" }).success).toBe(false);
    expect(itemCreateSchema.safeParse({ ...valid, uomId: "" }).success).toBe(false);
  });
  it("rejects a gstRate over 100", () => {
    expect(itemCreateSchema.safeParse({ ...valid, gstRate: 101 }).success).toBe(false);
  });
});
