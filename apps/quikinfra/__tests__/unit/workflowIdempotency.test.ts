import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { NextRequest } from "next/server";
import { idempotencyGuard, newIdempotencyKey } from "@/lib/workflow/idempotency";
import type { TenantContext } from "@/lib/auth/context";

const db = mockDb as any;

const ctx = { orgId: "org-1", userId: "user-1" } as unknown as TenantContext;

function makeReq(opts: {
  url?: string;
  body?: unknown;
  key?: string;
}): NextRequest {
  const headers = new Headers();
  if (opts.key) headers.set("idempotency-key", opts.key);
  const init: RequestInit = { method: "POST", headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  return new NextRequest(opts.url ?? "http://localhost/api/grn/g1/approve", init as any);
}

beforeEach(() => {
  resetMockDb();
});

describe("idempotencyGuard — first call", () => {
  it("runs the handler (no cache, no conflict) and parses the body", async () => {
    db.cnIdempotencyKey.findUnique.mockResolvedValue(null);
    db.cnIdempotencyKey.create.mockResolvedValue({});

    const req = makeReq({ body: { action: "approve" }, key: "key-123" });
    const guard = await idempotencyGuard(req, ctx, "grn.approve");

    expect(guard.cached).toBe(false);
    expect(guard.conflict).toBe(false);
    expect(guard.parsedBody).toEqual({ action: "approve" });
    expect(guard.key).toBe("key-123");
  });

  it("commit() persists the response for a 2xx result", async () => {
    db.cnIdempotencyKey.findUnique.mockResolvedValue(null);
    db.cnIdempotencyKey.create.mockResolvedValue({});

    const req = makeReq({ body: {}, key: "key-commit" });
    const guard = await idempotencyGuard(req, ctx, "grn.approve");
    await guard.commit(200, { ok: true });

    expect(db.cnIdempotencyKey.create).toHaveBeenCalledTimes(1);
    const data = db.cnIdempotencyKey.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      key: "key-commit",
      orgId: "org-1",
      userId: "user-1",
      route: "grn.approve",
      statusCode: 200,
      responseJson: { ok: true },
    });
  });

  it("commit() does NOT persist 5xx responses (transient — allow retry)", async () => {
    db.cnIdempotencyKey.findUnique.mockResolvedValue(null);
    const req = makeReq({ body: {}, key: "key-5xx" });
    const guard = await idempotencyGuard(req, ctx, "grn.approve");
    await guard.commit(503, { ok: false });
    expect(db.cnIdempotencyKey.create).not.toHaveBeenCalled();
  });

  it("auto-generates a synthetic key when no header is provided", async () => {
    db.cnIdempotencyKey.findUnique.mockResolvedValue(null);
    const req = makeReq({ body: { a: 1 } }); // no key header
    const guard = await idempotencyGuard(req, ctx, "grn.approve");
    expect(guard.key.startsWith("auto:org-1:user-1:grn.approve:")).toBe(true);
  });
});

describe("idempotencyGuard — replay (same key + same body)", () => {
  it("short-circuits with the cached response and does not re-run", async () => {
    db.cnIdempotencyKey.findUnique.mockImplementation(async () => {
      // The stored bodyHash must equal what the guard computes for THIS request
      // — easiest is to capture it from a first pass. Instead we re-derive it
      // by running the guard once with create stubbed, then replay.
      return undefined;
    });

    // First pass: capture the bodyHash actually written.
    db.cnIdempotencyKey.findUnique.mockResolvedValueOnce(null);
    db.cnIdempotencyKey.create.mockResolvedValue({});
    const req1 = makeReq({ url: "http://localhost/api/grn/g1/approve", body: { action: "approve" } });
    const g1 = await idempotencyGuard(req1, ctx, "grn.approve");
    await g1.commit(201, { id: "g1", status: "approved" });
    const stored = db.cnIdempotencyKey.create.mock.calls[0][0].data;

    // Second pass: an identical request finds the stored row → replay.
    db.cnIdempotencyKey.findUnique.mockResolvedValue({
      orgId: "org-1",
      bodyHash: stored.bodyHash,
      statusCode: stored.statusCode,
      responseJson: stored.responseJson,
    });
    const req2 = makeReq({ url: "http://localhost/api/grn/g1/approve", body: { action: "approve" } });
    const g2 = await idempotencyGuard(req2, ctx, "grn.approve");

    expect(g2.cached).toBe(true);
    expect(g2.conflict).toBe(false);
    expect(g2.cachedResponse).toBeDefined();
    expect(g2.cachedResponse!.status).toBe(201);
    expect(g2.cachedResponse!.headers.get("Idempotent-Replay")).toBe("true");
    await expect(g2.cachedResponse!.json()).resolves.toEqual({ id: "g1", status: "approved" });

    // commit on a cached guard is a no-op.
    db.cnIdempotencyKey.create.mockClear();
    await g2.commit(201, { id: "g1" });
    expect(db.cnIdempotencyKey.create).not.toHaveBeenCalled();
  });
});

describe("idempotencyGuard — conflicts", () => {
  it("same key + DIFFERENT body → 409 IDEMPOTENCY_BODY_MISMATCH", async () => {
    db.cnIdempotencyKey.findUnique.mockResolvedValue({
      orgId: "org-1",
      bodyHash: "some-other-hash",
      statusCode: 200,
      responseJson: {},
    });
    const req = makeReq({ body: { action: "approve" }, key: "reused" });
    const guard = await idempotencyGuard(req, ctx, "grn.approve");

    expect(guard.conflict).toBe(true);
    expect(guard.cached).toBe(false);
    expect(guard.conflictResponse!.status).toBe(409);
    await expect(guard.conflictResponse!.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_BODY_MISMATCH",
    });
  });

  it("existing key from a DIFFERENT org → 409 IDEMPOTENCY_CONFLICT", async () => {
    db.cnIdempotencyKey.findUnique.mockResolvedValue({
      orgId: "other-org",
      bodyHash: "x",
      statusCode: 200,
      responseJson: {},
    });
    const req = makeReq({ body: {}, key: "cross-org" });
    const guard = await idempotencyGuard(req, ctx, "grn.approve");

    expect(guard.conflict).toBe(true);
    expect(guard.conflictResponse!.status).toBe(409);
    await expect(guard.conflictResponse!.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
});

describe("newIdempotencyKey", () => {
  it("produces a unique uuid each call", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
