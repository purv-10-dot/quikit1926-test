import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../helpers/mockDb";

// Use the shared mockDb helper: its vi.mock("@/lib/db") is hoisted inside the
// helper module, avoiding the "Cannot access 'db' before initialization" TDZ
// error that a local `const db = mockDeep()` referenced from a hoisted
// vi.mock factory produces.
const db = mockDb();

import { getTenantCompanyBranding } from "@/lib/services/company-profile";

describe("getTenantCompanyBranding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses CrmCompanyProfile when present", async () => {
    db.qceCompanyProfile.findUnique.mockResolvedValue({
      companyName: "Acme Pvt Ltd",
      logoUrl: "https://cdn/acme.png",
      website: "https://acme.in",
      phone: "+91 99999",
    } as never);
    db.org.findUnique.mockResolvedValue({ name: "Org Fallback", logoUrl: null } as never);

    const branding = await getTenantCompanyBranding("tenant-1");
    expect(branding.companyName).toBe("Acme Pvt Ltd");
    expect(branding.logoUrl).toBe("https://cdn/acme.png");
    expect(branding.website).toBe("https://acme.in");
    expect(branding.phone).toBe("+91 99999");
  });

  it("falls back to org name when profile is missing", async () => {
    db.qceCompanyProfile.findUnique.mockResolvedValue(null);
    db.org.findUnique.mockResolvedValue({
      name: "QuikIT Demo Org",
      logoUrl: "https://cdn/org.png",
    } as never);

    const branding = await getTenantCompanyBranding("tenant-1");
    expect(branding.companyName).toBe("QuikIT Demo Org");
    expect(branding.logoUrl).toBe("https://cdn/org.png");
  });

  it("falls back to org name when profile companyName is blank", async () => {
    db.qceCompanyProfile.findUnique.mockResolvedValue({
      companyName: "   ",
      logoUrl: null,
      website: null,
      phone: null,
    } as never);
    db.org.findUnique.mockResolvedValue({ name: "Real Org", logoUrl: null } as never);

    const branding = await getTenantCompanyBranding("tenant-1");
    expect(branding.companyName).toBe("Real Org");
  });

  it('uses "Your Company" only when profile and org are missing', async () => {
    db.qceCompanyProfile.findUnique.mockResolvedValue(null);
    db.org.findUnique.mockResolvedValue(null);

    const branding = await getTenantCompanyBranding("tenant-1");
    expect(branding.companyName).toBe("Your Company");
  });
});
