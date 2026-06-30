import { describe, it, expect } from "vitest";
import { customerSchema, contactPersonSchema, bankAccountSchema } from "@/lib/validations/customer.schema";

const validBusiness = {
  contact_kind: "business",
  customer_category: "customer",
  display_name: "Globex Pvt Ltd",
  company_name: "Globex Pvt Ltd",
  mobile: "+91 90000 11111",
  tax_id: "27AAPFU0939F1ZV"
};

describe("customerSchema", () => {
  it("accepts a valid business customer and infers state code from GSTIN", () => {
    const parsed = customerSchema.safeParse(validBusiness);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.state_code).toBe("27");
      expect(parsed.data.is_active).toBe(true);
      expect(parsed.data.type).toBe("customer");
    }
  });

  it("rejects a business without a company name", () => {
    const parsed = customerSchema.safeParse({ ...validBusiness, company_name: "" });
    expect(parsed.success).toBe(false);
  });

  it("requires a first name for individuals", () => {
    const parsed = customerSchema.safeParse({ ...validBusiness, contact_kind: "individual", company_name: "", first_name: "" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid GSTIN check digit", () => {
    const parsed = customerSchema.safeParse({ ...validBusiness, tax_id: "27AAPFU0939F1ZZ" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a malformed TAN", () => {
    const parsed = customerSchema.safeParse({ ...validBusiness, tan: "BADTAN" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a malformed MSME/Udyam number", () => {
    const parsed = customerSchema.safeParse({ ...validBusiness, msme_number: "UDYAM-1234" });
    expect(parsed.success).toBe(false);
  });

  it("sets is_active=false when status is inactive", () => {
    const parsed = customerSchema.safeParse({ ...validBusiness, status: "inactive" });
    expect(parsed.success && parsed.data.is_active).toBe(false);
  });
});

describe("contactPersonSchema", () => {
  it("requires a name", () => {
    expect(contactPersonSchema.safeParse({ name: "" }).success).toBe(false);
    expect(contactPersonSchema.safeParse({ name: "Ravi", is_primary: true }).success).toBe(true);
  });
});

describe("bankAccountSchema", () => {
  it("validates IFSC format", () => {
    expect(bankAccountSchema.safeParse({ ifsc: "HDFC0000123" }).success).toBe(true);
    expect(bankAccountSchema.safeParse({ ifsc: "BADIFSC" }).success).toBe(false);
  });
});
