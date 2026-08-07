/**
 * FR-RE Stage 1 — status-source reconciliation, real DB.
 *
 * One canonical source: getDispositionStatuses(tenant, stage?) over the existing
 * getPipelineConfig. No stage => all configured statuses (rule-builder mode);
 * with stage => the stage-valid subset (agent mode), falling back to ALL for an
 * unmapped stage (never an empty list). The RECONCILIATION INVARIANT — the
 * stage-filtered set is always a subset of the full set — is the point of Stage 1.
 *
 * seedDispositionStageStatuses seeds a PLACEHOLDER stage->status map (migrated
 * from the legacy STAGE_STATUS_OPTIONS) ONLY when none exists — it must never
 * clobber a real mapping plugged in later.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma as db } from "../../helpers/integrationDb";
import { setPipelineConfig, getPipelineConfig } from "@/lib/services/workspace/pipeline-config";
import {
  getDispositionStatuses,
  seedDispositionStageStatuses,
  DISPOSITION_STAGE_STATUS_SEED,
} from "@/lib/services/forms/disposition-statuses.service";

const STAMP = Date.now();
const TENANT = `int_frre_s1_${STAMP}`;
const SEED_TENANT = `int_frre_s1seed_${STAMP}`;
const ST_A = `ZZ_S1A_${STAMP}`;
const ST_B = `ZZ_S1B_${STAMP}`;
const STAGE_A = `frre stage a ${STAMP}`;

beforeAll(async () => {
  // Two global statuses we can assert on (QcfLeadStatus is global; getPipelineConfig
  // derives cfg.statuses from it).
  await db.qcfLeadStatus.create({ data: { name: ST_A } });
  await db.qcfLeadStatus.create({ data: { name: ST_B } });
  // TENANT: a known stage->status mapping for the wrapper behaviour tests.
  await setPipelineConfig(TENANT, { dependentRules: { stageToStatuses: { [STAGE_A]: [ST_A] }, statusToSubstatuses: {} } });
});

afterAll(async () => {
  await db.qcfOrgWorkspaceSettings.deleteMany({ where: { tenantId: { in: [TENANT, SEED_TENANT] } } });
  await db.qcfLeadStatus.deleteMany({ where: { name: { in: [ST_A, ST_B] } } });
});

describe("getDispositionStatuses", () => {
  it("no stage (rule-builder mode) => all configured statuses", async () => {
    const all = await getDispositionStatuses(TENANT);
    expect(all).toContain(ST_A);
    expect(all).toContain(ST_B);
  });

  it("with a mapped stage (agent mode) => INCLUDES mapped, EXCLUDES unmapped (genuinely constrains)", async () => {
    const forStage = await getDispositionStatuses(TENANT, STAGE_A);
    expect(forStage).toContain(ST_A); // mapped to STAGE_A -> present
    expect(forStage).not.toContain(ST_B); // NOT mapped to STAGE_A -> filtered out (proves the constraint constrains)
    expect(forStage).toEqual([ST_A]);
  });

  it("unmapped stage => falls back to ALL (never empty)", async () => {
    const fallback = await getDispositionStatuses(TENANT, "no such stage");
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback).toContain(ST_A);
    expect(fallback).toContain(ST_B);
  });

  it("stage match is case-insensitive", async () => {
    expect(await getDispositionStatuses(TENANT, STAGE_A.toUpperCase())).toEqual([ST_A]);
  });

  it("RECONCILIATION INVARIANT: stage-filtered set is a subset of the full set", async () => {
    const all = new Set(await getDispositionStatuses(TENANT));
    const forStage = await getDispositionStatuses(TENANT, STAGE_A);
    expect(forStage.every((s) => all.has(s))).toBe(true);
  });
});

describe("seedDispositionStageStatuses — placeholder, idempotent, non-clobbering", () => {
  it("seeds the placeholder map when none exists", async () => {
    await seedDispositionStageStatuses(SEED_TENANT);
    const cfg = await getPipelineConfig(SEED_TENANT);
    expect(cfg.dependentRules.stageToStatuses).toEqual(DISPOSITION_STAGE_STATUS_SEED);
  });

  it("is idempotent (re-running does not change the mapping)", async () => {
    await seedDispositionStageStatuses(SEED_TENANT);
    const cfg = await getPipelineConfig(SEED_TENANT);
    expect(cfg.dependentRules.stageToStatuses).toEqual(DISPOSITION_STAGE_STATUS_SEED);
  });

  it("does NOT clobber an existing (real) mapping", async () => {
    const real = { "negotiation x": ["custom only"] };
    await setPipelineConfig(SEED_TENANT, { dependentRules: { stageToStatuses: real, statusToSubstatuses: {} } });
    await seedDispositionStageStatuses(SEED_TENANT); // must be a no-op now
    const cfg = await getPipelineConfig(SEED_TENANT);
    expect(cfg.dependentRules.stageToStatuses).toEqual(real);
  });
});
