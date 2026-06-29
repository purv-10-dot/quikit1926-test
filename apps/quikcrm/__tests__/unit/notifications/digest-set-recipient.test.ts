/**
 * Stage 3 (service) — setDigestRecipient (RED→GREEN).
 *
 * Toggles a userId into/out of settings.digest.recipientUserIds and persists via
 * the read-tree / write-tree merge (preserves sibling settings keys like
 * leadPipelineConfig / dashboard).
 *
 * AUTO-FLIP enabled (both directions, decision 2026-06-25):
 *   - first recipient toggled ON  → enabled becomes true
 *   - last recipient toggled OFF  → enabled becomes false
 *   keeps "has recipients" and "is enabled" in sync (kills recipients-but-disabled
 *   = silent nothing, AND enabled-but-empty = the digestCount:0 state).
 *
 * Idempotent: toggling ON an already-present id is a no-op set; OFF an absent id too.
 *
 * Function does not exist yet → RED.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";
import { setDigestRecipient } from "@/lib/services/workspace/digest-config";

const ORG = "org1";

function existing(settings: Record<string, unknown> | null) {
  (prismaMock.crmOrgWorkspaceSettings.findUnique as unknown as { mockResolvedValue: (v: unknown) => void })
    .mockResolvedValue(settings ? { orgId: ORG, settings } : null);
}
function captureUpsert() {
  const up = prismaMock.crmOrgWorkspaceSettings.upsert as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mock: { calls: { 0: { update: { settings: Record<string, unknown> } } }[] };
  };
  up.mockResolvedValue({} as never);
  return up;
}

beforeEach(() => vi.clearAllMocks());

describe("setDigestRecipient — toggle + auto-flip enabled (Stage 3)", () => {
  it("toggle ON: adds userId to recipientUserIds AND auto-flips enabled=true (was empty)", async () => {
    existing({ digest: { enabled: false, recipientUserIds: [] } });
    const up = captureUpsert();
    await setDigestRecipient(ORG, "u1", true);
    const written = (up.mock.calls[0]![0].update.settings as { digest: { enabled: boolean; recipientUserIds: string[] } }).digest;
    expect(written.recipientUserIds).toEqual(["u1"]);
    expect(written.enabled).toBe(true); // first recipient → enabled
  });

  it("toggle OFF the LAST recipient: removes it AND auto-flips enabled=false", async () => {
    existing({ digest: { enabled: true, recipientUserIds: ["u1"] } });
    const up = captureUpsert();
    await setDigestRecipient(ORG, "u1", false);
    const written = (up.mock.calls[0]![0].update.settings as { digest: { enabled: boolean; recipientUserIds: string[] } }).digest;
    expect(written.recipientUserIds).toEqual([]);
    expect(written.enabled).toBe(false); // last off → disabled
  });

  it("toggle OFF one of MANY: stays enabled (still has recipients)", async () => {
    existing({ digest: { enabled: true, recipientUserIds: ["u1", "u2"] } });
    const up = captureUpsert();
    await setDigestRecipient(ORG, "u1", false);
    const written = (up.mock.calls[0]![0].update.settings as { digest: { enabled: boolean; recipientUserIds: string[] } }).digest;
    expect(written.recipientUserIds).toEqual(["u2"]);
    expect(written.enabled).toBe(true);
  });

  it("PRESERVES sibling settings keys (leadPipelineConfig / dashboard not clobbered)", async () => {
    existing({ leadPipelineConfig: { stages: ["A"] }, dashboard: { funnelStages: ["X"] }, digest: { enabled: false, recipientUserIds: [] } });
    const up = captureUpsert();
    await setDigestRecipient(ORG, "u1", true);
    const written = up.mock.calls[0]![0].update.settings as Record<string, unknown>;
    expect(written.leadPipelineConfig).toEqual({ stages: ["A"] });
    expect(written.dashboard).toEqual({ funnelStages: ["X"] });
    expect((written.digest as { recipientUserIds: string[] }).recipientUserIds).toEqual(["u1"]);
  });

  it("toggle ON is idempotent (id already present → no duplicate)", async () => {
    existing({ digest: { enabled: true, recipientUserIds: ["u1"] } });
    const up = captureUpsert();
    await setDigestRecipient(ORG, "u1", true);
    const written = (up.mock.calls[0]![0].update.settings as { digest: { recipientUserIds: string[] } }).digest;
    expect(written.recipientUserIds).toEqual(["u1"]); // not ["u1","u1"]
  });

  it("works when no settings row exists yet (creates digest from scratch, enabled=true)", async () => {
    existing(null);
    const up = captureUpsert();
    await setDigestRecipient(ORG, "u1", true);
    const written = (up.mock.calls[0]![0].update.settings as { digest: { enabled: boolean; recipientUserIds: string[] } }).digest;
    expect(written.recipientUserIds).toEqual(["u1"]);
    expect(written.enabled).toBe(true);
  });
});
