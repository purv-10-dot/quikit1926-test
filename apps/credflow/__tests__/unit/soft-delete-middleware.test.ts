// TODO(packages/database): Move this test to packages/database/__tests__/
// once that package gets its own vitest config. This is a cross-package
// test placed here only because apps/quikcrm has the test runner today.
// Tracked in: TKT-DASHBOARD-SOFTDELETE-VITEST (replace with the real
// ticket id once filed by the integration owner).

/**
 * Bug 3 PR 2 — soft-delete middleware unit test.
 *
 * Validates that applySoftDeleteMiddleware:
 *   - injects `deletedAt: null` into args.where for registered models on
 *     findMany / findFirst / count / groupBy / aggregate
 *   - leaves unregistered models alone
 *   - respects top-level `deletedAt` overrides (no double-clause)
 *   - does NOT register hooks for findUnique / update / delete / upsert
 *     (mutation paths and PK lookups are caller-responsibility)
 *   - does NOT detect nested `deletedAt` under AND / OR — this is a
 *     documented limitation of the shallow check; pinning the behavior
 *     so refactors don't silently change it
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  applySoftDeleteMiddleware,
  SOFT_DELETE_MODELS,
} from "@quikit/database";

type Hook = (input: {
  model: string;
  args: { where?: unknown };
  query: (a: unknown) => Promise<unknown>;
}) => Promise<unknown>;

type ExtensionSpec = {
  query: { $allModels: Record<string, Hook> };
};

function captureHooks(): ExtensionSpec {
  let spec!: ExtensionSpec;
  const client = {
    $extends: (s: ExtensionSpec) => {
      spec = s;
      return client;
    },
  };
  applySoftDeleteMiddleware(client as unknown as PrismaClient);
  return spec;
}

describe("applySoftDeleteMiddleware — registration", () => {
  it("registers Crm models alongside the legacy ones", () => {
    expect(SOFT_DELETE_MODELS.has("CrmLead")).toBe(true);
    expect(SOFT_DELETE_MODELS.has("CrmOpportunity")).toBe(true);
    expect(SOFT_DELETE_MODELS.has("CrmAccount")).toBe(true);
    expect(SOFT_DELETE_MODELS.has("KPI")).toBe(true);
    expect(SOFT_DELETE_MODELS.has("CrmActivity")).toBe(false);
    expect(SOFT_DELETE_MODELS.has("CrmTask")).toBe(false);
  });
});

describe.each([
  ["findMany"],
  ["findFirst"],
  ["count"],
  ["groupBy"],
  ["aggregate"],
])("applySoftDeleteMiddleware — op %s", (op) => {
  it(`injects deletedAt: null on registered model ${op}`, async () => {
    const spec = captureHooks();
    const args = { where: { orgId: "t1" } };
    await spec.query.$allModels[op]({
      model: "CrmLead",
      args,
      query: vi.fn().mockResolvedValue(null),
    });
    expect(args.where).toEqual({ orgId: "t1", deletedAt: null });
  });

  it(`leaves unregistered model ${op} args alone`, async () => {
    const spec = captureHooks();
    const args = { where: { orgId: "t1" } };
    await spec.query.$allModels[op]({
      model: "CrmActivity",
      args,
      query: vi.fn().mockResolvedValue(null),
    });
    expect(args.where).toEqual({ orgId: "t1" });
  });

  it(`${op}: top-level deletedAt override is preserved (admin trash)`, async () => {
    const spec = captureHooks();
    const args = { where: { orgId: "t1", deletedAt: { not: null } } };
    await spec.query.$allModels[op]({
      model: "CrmLead",
      args,
      query: vi.fn().mockResolvedValue(null),
    });
    expect(args.where).toEqual({
      orgId: "t1",
      deletedAt: { not: null },
    });
  });

  it(`${op}: nested deletedAt under AND is NOT detected (shallow check)`, async () => {
    // Documented limitation — this test pins the behavior so a future
    // refactor doesn't silently extend the check (and break unrelated
    // callers who rely on the shallow semantics).
    const spec = captureHooks();
    const args = {
      where: { AND: [{ orgId: "t1" }, { deletedAt: { not: null } }] },
    };
    await spec.query.$allModels[op]({
      model: "CrmLead",
      args,
      query: vi.fn().mockResolvedValue(null),
    });
    expect(args.where).toEqual({
      AND: [{ orgId: "t1" }, { deletedAt: { not: null } }],
      deletedAt: null,
    });
  });
});

describe("applySoftDeleteMiddleware — uncovered ops", () => {
  it("does not register findUnique / update / delete / upsert / create", () => {
    const spec = captureHooks();
    const ops = Object.keys(spec.query.$allModels);
    expect(ops).toEqual(
      expect.arrayContaining([
        "findMany",
        "findFirst",
        "count",
        "groupBy",
        "aggregate",
      ]),
    );
    expect(ops).not.toContain("findUnique");
    expect(ops).not.toContain("findUniqueOrThrow");
    expect(ops).not.toContain("update");
    expect(ops).not.toContain("updateMany");
    expect(ops).not.toContain("delete");
    expect(ops).not.toContain("deleteMany");
    expect(ops).not.toContain("upsert");
    expect(ops).not.toContain("create");
  });
});
