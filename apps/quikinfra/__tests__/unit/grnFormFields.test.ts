import { describe, it, expect } from "vitest";
import { buildGrnFields } from "@/lib/grn-form-fields";

const poRefField = { key: "poId", label: "PO Reference", type: "select" as const };

function build(extra: Record<string, unknown> = {}) {
  return buildGrnFields({
    poRefField,
    projectOptions: [{ value: "p1", label: "Project 1" }],
    locationOptions: [{ value: "l1", label: "Loc 1" }],
    ...extra,
  });
}

function byKey(fields: Record<string, any>[], key: string) {
  return fields.find((f) => f.key === key);
}

describe("buildGrnFields", () => {
  it("places the caller's poRefField first", () => {
    const fields = build();
    expect(fields[0]).toBe(poRefField);
  });

  it("pins grnDate to the supplied default when given", () => {
    const fields = build({ grnDateDefault: "2025-06-01" });
    expect(byKey(fields, "grnDate")!.defaultValue).toBe("2025-06-01");
  });

  it("defaults grnDate to today (yyyy-MM-dd) when not pinned", () => {
    const fields = build();
    expect(byKey(fields, "grnDate")!.defaultValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("seeds vendor / project / storage / invoice defaults", () => {
    const fields = build({
      vendorDefault: "Acme",
      projectDefault: "p1",
      storageLocationDefault: "l1",
      invoiceValueDefault: "1000",
    });
    expect(byKey(fields, "vendorName")!.defaultValue).toBe("Acme");
    expect(byKey(fields, "projectId")!.defaultValue).toBe("p1");
    expect(byKey(fields, "storageLocationId")!.defaultValue).toBe("l1");
    expect(byKey(fields, "invoiceValue")!.defaultValue).toBe("1000");
  });

  it("marks challanNo, challanDate and the challan attachment as required", () => {
    const fields = build();
    expect(byKey(fields, "challanNo")!.required).toBe(true);
    expect(byKey(fields, "challanDate")!.required).toBe(true);
    expect(byKey(fields, "challanAttachment")!.required).toBe(true);
  });

  it("disables the vendor field (auto-filled from PO)", () => {
    expect(byKey(build(), "vendorName")!.disabled).toBe(true);
  });

  it("defaults overall quality status to Accepted", () => {
    expect(byKey(build(), "overallQualityStatus")!.defaultValue).toBe("Accepted");
  });
});

describe("ewayBillNo conditional + validator", () => {
  const eway = () => byKey(build(), "ewayBillNo")!;

  it("requiredIf true when invoice value >= 50000 and not intercity-exempt", () => {
    expect(eway().requiredIf({ invoiceValue: "60000" })).toBe(true);
  });
  it("requiredIf false below 50000", () => {
    expect(eway().requiredIf({ invoiceValue: "10000" })).toBe(false);
  });
  it("requiredIf false when intercity transfer exempt", () => {
    expect(eway().requiredIf({ invoiceValue: "60000", intercityTransferExempt: "true" })).toBe(false);
  });
  it("validator passes for empty and for a 12-digit number", () => {
    expect(eway().validator("")).toEqual({ valid: true });
    expect(eway().validator("123456789012")).toEqual({ valid: true });
  });
  it("validator fails for a non-12-digit value", () => {
    expect(eway().validator("123").valid).toBe(false);
  });
});
