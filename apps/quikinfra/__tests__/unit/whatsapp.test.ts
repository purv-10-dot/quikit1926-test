import { describe, it, expect } from "vitest";
import {
  normalizePhoneForWhatsApp,
  resolveVendorPhone,
  whatsappUrl,
} from "@/lib/whatsapp";

describe("normalizePhoneForWhatsApp", () => {
  it("prefixes 91 onto a 10-digit Indian mobile", () => {
    expect(normalizePhoneForWhatsApp("9876543210")).toBe("919876543210");
  });
  it("strips formatting before normalizing", () => {
    expect(normalizePhoneForWhatsApp("+91 98765-43210")).toBe("919876543210");
  });
  it("keeps an already-prefixed 12-digit 91 number", () => {
    expect(normalizePhoneForWhatsApp("919876543210")).toBe("919876543210");
  });
  it("drops a leading 0 on an 11-digit number", () => {
    expect(normalizePhoneForWhatsApp("09876543210")).toBe("919876543210");
  });
  it("rejects an empty / non-numeric string", () => {
    expect(normalizePhoneForWhatsApp("")).toBeNull();
    expect(normalizePhoneForWhatsApp("abc")).toBeNull();
  });
  it("rejects a 10-digit number not starting 6-9", () => {
    expect(normalizePhoneForWhatsApp("1234567890")).toBeNull();
  });
  it("passes through a generic 11-15 digit international number", () => {
    expect(normalizePhoneForWhatsApp("14155552671")).toBe("14155552671");
  });
});

describe("resolveVendorPhone", () => {
  it("prefers the row's direct vendorPhone", () => {
    expect(resolveVendorPhone({ vendorPhone: "9876543210" })).toBe("9876543210");
  });
  it("uses the masters map phone when present", () => {
    const map = new Map([["v1", { phone: "9111111111" }]]);
    expect(resolveVendorPhone({ vendorId: "v1" }, map)).toBe("9111111111");
  });
  it("falls back to mobile when phone is null", () => {
    const map = new Map([["v1", { phone: null, mobile: "9000000000" }]]);
    expect(resolveVendorPhone({ vendorId: "v1" }, map)).toBe("9000000000");
  });
  it("returns empty string when nothing resolves", () => {
    expect(resolveVendorPhone({})).toBe("");
    expect(resolveVendorPhone({ vendorId: "missing" }, new Map())).toBe("");
  });
});

describe("whatsappUrl", () => {
  it("builds a bare wa.me link without a message", () => {
    expect(whatsappUrl("9876543210")).toBe("https://wa.me/919876543210");
  });
  it("appends a URL-encoded text query", () => {
    expect(whatsappUrl("9876543210", "Hi there")).toBe("https://wa.me/919876543210?text=Hi%20there");
  });
  it("ignores a whitespace-only message", () => {
    expect(whatsappUrl("9876543210", "   ")).toBe("https://wa.me/919876543210");
  });
  it("returns null for an unnormalizable phone", () => {
    expect(whatsappUrl("xyz")).toBeNull();
  });
});
