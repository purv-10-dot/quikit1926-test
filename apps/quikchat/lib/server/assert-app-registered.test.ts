import { afterEach, describe, expect, it, vi } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted) so the App
// lookup is controllable without a database.
import { mockDb } from "../../__tests__/helpers/mockDb";
import { assertQuikChatAppRegistered } from "./assert-app-registered";

// Next's ProcessEnv augmentation marks NODE_ENV readonly; cast once so tests can
// set it directly rather than routing through a defineProperty dance.
const env = process.env as unknown as Record<string, string | undefined>;

/**
 * The App-row boot assertion.
 *
 * The failure it exists for is SILENCE: with no `App` row for slug `quikchat`,
 * `getQuikChatAppId()` returns null, so `userCan()` is false for everything and
 * no role can be seeded — yet the app serves chat happily, because most routes
 * are not userCan-gated and `requireAdmin` never consults appId. A crash would
 * be noticed; this is not.
 *
 * Three-way behaviour, and the split is the point: unlike
 * `assertProductionSecrets` (pure env reads), this makes boot depend on the
 * DATABASE. `register()` runs per cold start, so an unconditional throw would
 * turn a transient DB blip into a crash loop across every one of them. We only
 * hard-fail when we actually KNOW the row is absent.
 */
describe("assertQuikChatAppRegistered", () => {
  const savedNodeEnv = env.NODE_ENV;
  afterEach(() => {
    env.NODE_ENV = savedNodeEnv;
    vi.restoreAllMocks();
  });

  it("throws in production when the row is definitively absent", async () => {
    env.NODE_ENV = "production";
    mockDb.app.findUnique.mockResolvedValue(null as never);

    await expect(assertQuikChatAppRegistered()).rejects.toThrow(/slug "quikchat"/);
  });

  it("does not throw in production when the row exists", async () => {
    env.NODE_ENV = "production";
    mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);

    await expect(assertQuikChatAppRegistered()).resolves.toBeUndefined();
  });

  // The distinction that keeps a DB hiccup from becoming an outage: a failed
  // QUERY is not evidence of misconfiguration, so it must never fail the boot —
  // not even in production.
  it("does NOT throw in production when the query itself fails", async () => {
    env.NODE_ENV = "production";
    mockDb.app.findUnique.mockRejectedValue(new Error("ECONNREFUSED") as never);

    await expect(assertQuikChatAppRegistered()).resolves.toBeUndefined();
  });

  // Never hard-fail a local boot: a freshly-cloned DB without the row is a
  // normal state, and an assertion that breaks `npm run dev` gets deleted rather
  // than fixed.
  it("does not throw in development when the row is absent", async () => {
    env.NODE_ENV = "development";
    mockDb.app.findUnique.mockResolvedValue(null as never);

    await expect(assertQuikChatAppRegistered()).resolves.toBeUndefined();
  });
});
