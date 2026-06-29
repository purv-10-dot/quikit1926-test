/**
 * Phase 5 — digest config read (step-1 plumbing, RED→GREEN).
 *
 * Mirrors getDashboardConfig: reads CrmOrgWorkspaceSettings.settings.digest,
 * defaults sensibly on first read, NO write (read-on-read). Per the locked
 * decisions:
 *   - DEFAULT DISABLED (opt-in — a digest that emails leadership must be
 *     deliberately turned on, never defaulted-on).
 *   - Shape allows per-recipient opt-out to be ADDED later without a rewrite:
 *     { enabled, frequency, recipientRoles, types?, optOut? }.
 *
 * NO shared-function edits here (this is the cheap plumbing unit). getDigestConfig
 * does not exist yet → RED.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";
import { getDigestConfig } from "@/lib/services/workspace/digest-config";

const findUnique = prismaMock.crmOrgWorkspaceSettings.findUnique as unknown as {
  mockResolvedValue: (v: unknown) => void;
};

beforeEach(() => vi.clearAllMocks());

describe("getDigestConfig — opt-in, default-disabled (Phase 5 plumbing)", () => {
  it("defaults to DISABLED when no settings row exists (opt-in)", async () => {
    findUnique.mockResolvedValue(null);
    const cfg = await getDigestConfig("org1");
    expect(cfg.enabled).toBe(false);
  });

  it("defaults to DISABLED when settings exist but no digest key (opt-in)", async () => {
    findUnique.mockResolvedValue({ orgId: "org1", settings: { dashboard: {} } });
    const cfg = await getDigestConfig("org1");
    expect(cfg.enabled).toBe(false);
  });

  it("provides sensible defaults for the rest (frequency daily, leadership roles)", async () => {
    findUnique.mockResolvedValue(null);
    const cfg = await getDigestConfig("org1");
    expect(cfg.frequency).toBe("daily");
    // recipients default to the two leadership roles (decision 2)
    expect(cfg.recipientRoles).toEqual(
      expect.arrayContaining(["Administrator", "SalesManager"]),
    );
    // shape is opt-out-ready: optOut is an array (empty by default), types optional
    expect(Array.isArray(cfg.optOut)).toBe(true);
  });

  it("reads stored config when present (enabled + configured subset + optOut)", async () => {
    findUnique.mockResolvedValue({
      orgId: "org1",
      settings: {
        digest: {
          enabled: true,
          frequency: "daily",
          recipientRoles: ["Administrator"],
          types: ["at1", "at2"],
          optOut: ["u9"],
        },
      },
    });
    const cfg = await getDigestConfig("org1");
    expect(cfg.enabled).toBe(true);
    expect(cfg.recipientRoles).toEqual(["Administrator"]);
    expect(cfg.types).toEqual(["at1", "at2"]);
    expect(cfg.optOut).toEqual(["u9"]);
  });

  it("reads recipientUserIds when stored (the explicit allow-list)", async () => {
    findUnique.mockResolvedValue({
      orgId: "org1",
      settings: { digest: { enabled: true, recipientUserIds: ["a", "b"] } },
    });
    const cfg = await getDigestConfig("org1");
    expect(cfg.recipientUserIds).toEqual(["a", "b"]);
  });

  it("defaults recipientUserIds to an empty array when absent (additive, allow-list-ready)", async () => {
    findUnique.mockResolvedValue(null);
    const cfg = await getDigestConfig("org1");
    expect(Array.isArray(cfg.recipientUserIds)).toBe(true);
    expect(cfg.recipientUserIds).toEqual([]);
  });

  it("does NOT write on read (read-on-read, like getDashboardConfig)", async () => {
    findUnique.mockResolvedValue(null);
    await getDigestConfig("org1");
    expect(prismaMock.crmOrgWorkspaceSettings.update).not.toHaveBeenCalled();
    expect(prismaMock.crmOrgWorkspaceSettings.upsert).not.toHaveBeenCalled();
    expect(prismaMock.crmOrgWorkspaceSettings.create).not.toHaveBeenCalled();
  });
});
