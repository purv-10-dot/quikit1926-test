import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { mcpDb, McpDeleteGuardrailError, guardClient } from "@/lib/mcp/guardedDb";

beforeEach(() => {
  resetMockDb();
});

describe("mcpDb guardrail (QUIKTR-118)", () => {
  it("throws McpDeleteGuardrailError synchronously on delete, for any model", () => {
    expect(() => mcpDb.qtIssue.delete({ where: { id: "issue_1" } })).toThrow(McpDeleteGuardrailError);
    expect(() => mcpDb.qtProject.delete({ where: { id: "proj_1" } })).toThrow(McpDeleteGuardrailError);
  });

  it("throws McpDeleteGuardrailError synchronously on deleteMany, for any model", () => {
    expect(() => mcpDb.qtIssueComment.deleteMany({ where: { issueId: "issue_1" } })).toThrow(McpDeleteGuardrailError);
    expect(() => mcpDb.qtIssueLink.deleteMany({ where: { sourceIssueId: "issue_1" } })).toThrow(
      McpDeleteGuardrailError,
    );
  });

  it("never reaches the underlying database client for a blocked operation", () => {
    expect(() => mcpDb.qtIssue.delete({ where: { id: "issue_1" } })).toThrow(McpDeleteGuardrailError);
    expect(mockDb.qtIssue.delete).not.toHaveBeenCalled();
  });

  it("does not block reads, creates, or updates", async () => {
    mockDb.qtIssue.findMany.mockResolvedValue([{ id: "issue_1" }] as never);
    mockDb.qtIssue.update.mockResolvedValue({ id: "issue_1" } as never);
    mockDb.qtIssue.create.mockResolvedValue({ id: "issue_1" } as never);

    await expect(mcpDb.qtIssue.findMany({})).resolves.toEqual([{ id: "issue_1" }]);
    await expect(mcpDb.qtIssue.update({ where: { id: "issue_1" }, data: {} })).resolves.toEqual({ id: "issue_1" });
    await expect(mcpDb.qtIssue.create({ data: {} as never })).resolves.toEqual({ id: "issue_1" });
  });
});

/**
 * Regression tests for a real bug found live-testing QUIKTR-122 against
 * quiktrack-uat: guardClient's `get` trap unconditionally wrapped any
 * object/function-typed property in guardModelDelegate, including Prisma
 * 5.7's internal `_extensions` property on a transaction client. That
 * property is non-configurable and non-writable, so substituting a wrapping
 * Proxy for it violates the ECMAScript Proxy get-trap invariant and throws
 * a TypeError at the engine level. vitest-mock-extended's deep mock doesn't
 * have this property shape, so these tests use plain synthetic objects with
 * Object.defineProperty to reproduce it directly.
 */
describe("guardClient — Proxy get-trap invariant (non-configurable/non-writable properties)", () => {
  it("passes through a non-configurable, non-writable own property unchanged (does not throw, preserves identity)", () => {
    const innerExtensions = {};
    const rawTarget: Record<string, unknown> = {};
    Object.defineProperty(rawTarget, "_extensions", {
      value: innerExtensions,
      writable: false,
      configurable: false,
      enumerable: true,
    });

    const guarded = guardClient(rawTarget);

    let result: unknown;
    expect(() => {
      result = (guarded as Record<string, unknown>)._extensions;
    }).not.toThrow();
    expect(result).toBe(innerExtensions);
  });

  it("still wraps a normal (configurable, writable) model-delegate-shaped property", () => {
    const rawTarget = { qtIssue: { delete: () => "should never run", findMany: () => [] } };
    const guarded = guardClient(rawTarget);
    expect(() => (guarded.qtIssue as { delete: () => unknown }).delete()).toThrow(McpDeleteGuardrailError);
  });

  it("propagates the fix through the $transaction interactive-callback path (covers both create_issue's bundled tx and create_test_case's own tx)", async () => {
    const innerExtensions = {};
    const rawTx: Record<string, unknown> = { qtIssue: { findMany: () => [] } };
    Object.defineProperty(rawTx, "_extensions", {
      value: innerExtensions,
      writable: false,
      configurable: false,
      enumerable: true,
    });

    const rawClient = {
      $transaction: async (cb: (tx: object) => unknown) => cb(rawTx),
    };
    const guarded = guardClient(rawClient);

    let capturedExtensions: unknown;
    await expect(
      guarded.$transaction(async (tx: Record<string, unknown>) => {
        expect(() => {
          capturedExtensions = tx._extensions;
        }).not.toThrow();
        return "ok";
      }),
    ).resolves.toBe("ok");
    expect(capturedExtensions).toBe(innerExtensions);
  });

  it("does not throw when $transaction itself is a non-configurable, non-writable own property", () => {
    const rawClient: Record<string, unknown> = {};
    const originalTransaction = async (cb: (tx: object) => unknown) => cb({});
    Object.defineProperty(rawClient, "$transaction", {
      value: originalTransaction,
      writable: false,
      configurable: false,
    });

    const guarded = guardClient(rawClient);
    let read: unknown;
    expect(() => {
      read = (guarded as Record<string, unknown>).$transaction;
    }).not.toThrow();
    expect(read).toBe(originalTransaction);
  });
});
