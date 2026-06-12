import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@quikit/database";

const db = mockDeep<PrismaClient>();

vi.mock("@/lib/db", () => ({ db }));

import { getTenantCompanyBranding } from "@/lib/services/company-profile";

describe("getTenantCompanyBranding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses CrmCompanyProfile when present", async () => {
    db.crmCompanyProfile.findUnique.mockResolvedValue({
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
    db.crmCompanyProfile.findUnique.mockResolvedValue(null);
    db.org.findUnique.mockResolvedValue({
      name: "QuikIT Demo Org",
      logoUrl: "https://cdn/org.png",
    } as never);

    const branding = await getTenantCompanyBranding("tenant-1");
    expect(branding.companyName).toBe("QuikIT Demo Org");
    expect(branding.logoUrl).toBe("https://cdn/org.png");
  });

  it("falls back to org name when profile companyName is blank", async () => {
    db.crmCompanyProfile.findUnique.mockResolvedValue({
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
    db.crmCompanyProfile.findUnique.mockResolvedValue(null);
    db.org.findUnique.mockResolvedValue(null);

    const branding = await getTenantCompanyBranding("tenant-1");
    expect(branding.companyName).toBe("Your Company");
  });
});
