/**
 * Bug 3 PR 2 — dashboard integration test.
 *
 * Wires the real soft-delete middleware around a hand-rolled fake Prisma
 * client whose `$extends` faithfully runs the middleware's spec, then
 * runs buildSummary end-to-end. The fake's underlying count/groupBy
 * implementations look at `args.where` and return different values for
 * "active" vs "trashed" — simulating a tenant with both kinds of rows.
 * Verifies the dashboard reports active-only counts.
 *
 * Why a hand-rolled fake instead of mockDeep<PrismaClient>():
 *   mockDeep stubs every method including `$extends`, so calling
 *   applySoftDeleteMiddleware(deepMock) returns a fresh deep proxy that
 *   never actually runs the middleware spec. The fake below routes
 *   wrapped-client ops through the spec hook → underlying impl, so the
 *   middleware behaves as it would in production.
 *
 * LIMITATION: This fake only supports the ops listed in the OPS array.
 * If summary-service ever calls a Prisma op not in OPS, the fake
 * returns undefined and the test may pass spuriously. When extending
 * summary-service with new query types (e.g. findMany, aggregateRaw,
 * $transaction), also extend this fake's OPS array. Long-term fix is
 * to bootstrap a real Prisma test DB at the packages/database level —
 * see TKT-DASHBOARD-SOFTDELETE-VITEST.
 *
 * Note: this test does NOT distinguish whether the `deletedAt: null`
 * clause came from app code (PR 1's defense in depth) or from the
 * middleware. That distinction is covered by:
 *   - apps/quikcrm/__tests__/unit/soft-delete-middleware.test.ts (the
 *     middleware in isolation)
 *   - apps/quikcrm/__tests__/unit/dashboard-soft-delete.test.ts (the
 *     app code in isolation, with prisma mocked at the args boundary)
 * This file's job is to confirm the combined stack returns the right
 * numbers to the user.
 */
import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { applySoftDeleteMiddleware } from "@quikit/database";

type Hook = (input: {
  model: string;
  args: { where?: unknown };
  query: (a: unknown) => Promise<unknown>;
}) => Promise<unknown>;

type Spec = { query: { $allModels: Record<string, Hook> } };

const MODELS = [
  "qcfLead",
  "qcfOpportunity",
  "qcfAccount",
  "qcfActivity",
  "qcfTask",
  "qcfOrgWorkspaceSettings",
] as const;
const OPS = [
  "findMany",
  "findFirst",
  "findUnique",
  "count",
  "groupBy",
  "aggregate",
] as const;

type Impl = (args: unknown) => Promise<unknown>;

function makeFake(): {
  fakeClient: PrismaClient;
  setImpl: (model: string, op: string, fn: Impl) => void;
} {
  const underlying: Record<string, Record<string, Impl>> = {};
  const setImpl = (model: string, op: string, fn: Impl): void => {
    underlying[model] ??= {};
    underlying[model][op] = fn;
  };
  const fakeClient = {
    $extends: (spec: Spec) => {
      const wrapped: Record<string, Record<string, Impl>> = {};
      for (const m of MODELS) {
        const pascal = m.charAt(0).toUpperCase() + m.slice(1);
        wrapped[m] = {};
        for (const op of OPS) {
          wrapped[m][op] = async (args: unknown) => {
            const hook = spec.query.$allModels[op];
            const queryFn: Impl =
              underlying[m]?.[op] ?? (() => Promise.resolve(undefined));
            return hook
              ? hook({
                  model: pascal,
                  args: args as { where?: unknown },
                  query: queryFn,
                })
              : queryFn(args);
          };
        }
      }
      return wrapped;
    },
  } as unknown as PrismaClient;
  return { fakeClient, setImpl };
}

const { fakeClient, setImpl } = makeFake();
const wrapped = applySoftDeleteMiddleware(fakeClient);

vi.doMock("@quikit/database", async (importActual) => {
  const actual = await importActual<typeof import("@quikit/database")>();
  return { ...actual, db: wrapped };
});
vi.doMock("@/lib/db", () => ({ db: wrapped }));
vi.doMock("@/lib/db/prisma", () => ({ prisma: wrapped }));

vi.doMock("@/lib/auth/require", () => ({
  requireApiUser: vi.fn(async () => ({
    userId: "u1",
    tenantId: "t1",
    role: "SalesUser",
    email: "u@example.com",
    name: "Test",
  })),
  isResponse: (x: unknown): x is Response => x instanceof Response,
  errorResponse: (e: unknown) => {
    const m = e instanceof Error ? e.message : "err";
    return NextResponse.json({ error: m }, { status: 500 });
  },
}));
vi.doMock("@/lib/auth/permissions", () => ({
  assertModule: vi.fn().mockResolvedValue(undefined),
}));

// Returns 1 if `deletedAt: null` is at the top level of args.where,
// 5 otherwise — simulating a tenant with 1 active and 4 trashed rows.
function activeAwareCount(): Impl {
  return (args: unknown) => {
    const w =
      (args as { where?: Record<string, unknown> } | undefined)?.where ?? {};
    return Promise.resolve(
      "deletedAt" in w && w.deletedAt === null ? 1 : 5,
    );
  };
}

describe("dashboard middleware integration — counts exclude soft-deleted rows", () => {
  it("buildSummary reports active-only lead/opp/account counts", async () => {
    setImpl("qcfLead", "count", activeAwareCount());
    setImpl("qcfOpportunity", "count", activeAwareCount());
    setImpl("qcfAccount", "count", activeAwareCount());
    setImpl("qcfTask", "count", () => Promise.resolve(0));
    setImpl("qcfActivity", "count", () => Promise.resolve(0));
    setImpl("qcfLead", "groupBy", () => Promise.resolve([]));
    setImpl("qcfOpportunity", "groupBy", () => Promise.resolve([]));
    setImpl("qcfOrgWorkspaceSettings", "findUnique", () =>
      Promise.resolve(null),
    );

    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    const summary = await buildSummary(
      { userId: "u1", tenantId: "t1", role: "SalesUser" } as never,
      {
        range: {
          from: new Date("2026-04-25T00:00:00Z"),
          to: new Date("2026-05-01T23:59:59.999Z"),
          tz: "UTC",
        },
        resolvedOwnerId: null,
        ownerId: null,
      } as never,
    );
    expect(summary.leadCount).toBe(1);
    expect(summary.openOpportunityCount).toBe(1);
    expect(summary.accountCount).toBe(1);
  });
});
