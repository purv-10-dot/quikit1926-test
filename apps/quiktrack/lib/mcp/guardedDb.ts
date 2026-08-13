/**
 * QUIKTR-118 — MCP no-delete guardrail (layer 3, service-layer enforcement).
 *
 * `mcpDb` is the shared `db` client wrapped in a plain JS Proxy that throws
 * before any `.delete()`/`.deleteMany()` reaches the database, on every
 * model. `lib/mcp/server.ts` imports this instead of the raw `db`, so every
 * current and future tool in that file is covered automatically.
 *
 * Implemented as a hand-rolled Proxy rather than a Prisma Client Extension
 * (`$extends`): this repo's test harness (`__tests__/helpers/mockDb.ts`)
 * deep-mocks `PrismaClient` with `vitest-mock-extended`, which does not
 * implement `$extends` semantics — calling it on the mock just returns
 * another mock rather than an extended client, silently breaking every
 * query in tests. A plain Proxy works identically over a real Prisma
 * client or the deep-mocked test client, since it only relies on standard
 * JS property access, not any Prisma-specific extension mechanism.
 *
 * `$transaction`'s interactive-callback form is special-cased so the `tx`
 * handed to a transaction callback is guarded too — the tx client isn't
 * `mcpDb` itself, it's whatever `db.$transaction` constructs internally,
 * so it needs to be wrapped on the way in.
 *
 * See docs/mcp-security.md for the full three-layer guardrail write-up.
 */
import { db } from "@/lib/db";

export class McpDeleteGuardrailError extends Error {
  constructor(operation: string) {
    super(`Blocked: the MCP server attempted a "${operation}" operation, which is never permitted (QUIKTR-118 guardrail).`);
    this.name = "McpDeleteGuardrailError";
  }
}

const BLOCKED_OPERATIONS = new Set(["delete", "deleteMany"]);

function guardModelDelegate<T extends object>(model: T): T {
  return new Proxy(model, {
    // Deliberately NOT forwarding the trap's `receiver` into Reflect.get —
    // vitest-mock-extended's deep mock is itself implemented with internal
    // lazy-getter Proxies, and passing this outer Proxy through as `this`
    // breaks its internal state (property access silently returns
    // `undefined` instead of the mock). Reading with `target` as the
    // receiver keeps `this` correct for both the real Prisma client and
    // the mock.
    get(target, prop) {
      if (typeof prop === "string" && BLOCKED_OPERATIONS.has(prop)) {
        return () => {
          throw new McpDeleteGuardrailError(prop);
        };
      }
      return Reflect.get(target, prop, target);
    },
  });
}

function guardClient<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "$transaction") {
        const original = Reflect.get(target, prop, target) as (...args: unknown[]) => unknown;
        return (...args: unknown[]) => {
          const [first, ...rest] = args;
          if (typeof first === "function") {
            const wrappedCallback = (tx: object) => (first as (tx: object) => unknown)(guardClient(tx));
            return original.apply(target, [wrappedCallback, ...rest]);
          }
          // Batch form (array of already-built query promises) — each
          // promise was already constructed against a guarded delegate if
          // the caller built it via `mcpDb.model.op(...)`, nothing to wrap.
          return original.apply(target, args);
        };
      }
      const value = Reflect.get(target, prop, target);
      // Model delegates are objects on a real PrismaClient, but some deep
      // mock implementations represent them as callable (function-typed)
      // Proxies — check both, or a function-shaped delegate silently skips
      // the guard entirely.
      if (value && (typeof value === "object" || typeof value === "function") && typeof prop === "string" && !prop.startsWith("$")) {
        return guardModelDelegate(value);
      }
      return value;
    },
  });
}

export const mcpDb = guardClient(db);
