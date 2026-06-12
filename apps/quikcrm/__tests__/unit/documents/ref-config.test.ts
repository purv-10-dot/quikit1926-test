import { describe, expect, it } from "vitest";
import { isDocumentRefType } from "@/lib/services/documents/types";

describe("document ref types", () => {
  it("accepts supported entity types", () => {
    expect(isDocumentRefType("lead")).toBe(true);
    expect(isDocumentRefType("account")).toBe(true);
    expect(isDocumentRefType("opportunity")).toBe(true);
    expect(isDocumentRefType("quote")).toBe(true);
    expect(isDocumentRefType("order")).toBe(true);
  });

  it("rejects unknown types", () => {
    expect(isDocumentRefType("contact")).toBe(false);
    expect(isDocumentRefType("")).toBe(false);
  });
});
