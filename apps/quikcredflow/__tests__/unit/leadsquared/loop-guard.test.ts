import { describe, expect, it } from "vitest";
import {
  hashPayload,
  shouldApplyInbound,
  shouldPushToLeadSquared,
} from "@/lib/services/leadsquared/loop-guard";

describe("hashPayload", () => {
  it("is stable across key ordering", () => {
    const a = hashPayload({ email: "a@x.com", phone: "123", stage: "New" });
    const b = hashPayload({ stage: "New", phone: "123", email: "a@x.com" });
    expect(a).toBe(b);
  });

  it("is stable for nested objects regardless of key order", () => {
    const a = hashPayload({ lead: { name: "Ann", meta: { x: 1, y: 2 } } });
    const b = hashPayload({ lead: { meta: { y: 2, x: 1 }, name: "Ann" } });
    expect(a).toBe(b);
  });

  it("changes when any value changes", () => {
    const base = hashPayload({ stage: "New", status: "Open" });
    expect(hashPayload({ stage: "Won", status: "Open" })).not.toBe(base);
    expect(hashPayload({ stage: "New", status: "Closed" })).not.toBe(base);
  });

  it("preserves array order (order is meaningful)", () => {
    expect(hashPayload({ tags: ["a", "b"] })).not.toBe(
      hashPayload({ tags: ["b", "a"] }),
    );
  });

  it("distinguishes missing key from explicit null / undefined-ish", () => {
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 1, b: null }));
  });

  it("returns a 64-char hex sha256 digest", () => {
    expect(hashPayload({ any: "thing" })).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("shouldPushToLeadSquared", () => {
  it("does not push changes that originated in LeadSquared (echo guard)", () => {
    expect(
      shouldPushToLeadSquared({
        origin: "leadsquared",
        newHash: "abc",
        lastHash: "different",
      }),
    ).toBe(false);
  });

  it("does not push when the payload is unchanged from the last sync", () => {
    expect(
      shouldPushToLeadSquared({
        origin: "crm",
        newHash: "same",
        lastHash: "same",
      }),
    ).toBe(false);
  });

  it("pushes a genuine CRM change", () => {
    expect(
      shouldPushToLeadSquared({
        origin: "crm",
        newHash: "new",
        lastHash: "old",
      }),
    ).toBe(true);
  });

  it("pushes a first-time CRM change (no prior hash)", () => {
    expect(
      shouldPushToLeadSquared({ origin: "crm", newHash: "new", lastHash: null }),
    ).toBe(true);
    expect(
      shouldPushToLeadSquared({
        origin: "crm",
        newHash: "new",
        lastHash: undefined,
      }),
    ).toBe(true);
  });
});

describe("shouldApplyInbound", () => {
  it("drops an inbound payload identical to our last sync (echo)", () => {
    expect(shouldApplyInbound({ newHash: "same", lastHash: "same" })).toBe(
      false,
    );
  });

  it("applies a genuine inbound change", () => {
    expect(shouldApplyInbound({ newHash: "new", lastHash: "old" })).toBe(true);
  });

  it("applies a first-time inbound lead (no prior hash)", () => {
    expect(shouldApplyInbound({ newHash: "new", lastHash: null })).toBe(true);
    expect(shouldApplyInbound({ newHash: "new", lastHash: undefined })).toBe(
      true,
    );
  });
});

describe("loop guard end-to-end (the echo it prevents)", () => {
  it("a CRM push followed by its own webhook echo is not re-applied or re-pushed", () => {
    // 1. CRM edits a lead. We compute + would persist this hash on push.
    const payload = { email: "lead@x.com", phone: "999", stage: "Qualified" };
    const syncedHash = hashPayload(payload);

    expect(
      shouldPushToLeadSquared({
        origin: "crm",
        newHash: syncedHash,
        lastHash: null,
      }),
    ).toBe(true);

    // 2. LSQ echoes that same change back via webhook. Same content -> same
    //    hash -> inbound is dropped, so no CRM write, so nothing re-pushed.
    const echoHash = hashPayload({
      stage: "Qualified",
      phone: "999",
      email: "lead@x.com",
    });
    expect(shouldApplyInbound({ newHash: echoHash, lastHash: syncedHash })).toBe(
      false,
    );
  });
});
