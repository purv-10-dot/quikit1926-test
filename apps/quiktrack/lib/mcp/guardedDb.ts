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

/**
 * True when `target`'s OWN property `prop` is a non-configurable,
 * non-writable data property — the one shape where a Proxy `get` trap's
 * ECMAScript invariant (spec 9.5.8, step 10) forces the trap to return the
 * exact same value as the target's real property (SameValue). Returning
 * anything else — including a Proxy wrapping that same underlying object —
 * throws a hard TypeError at the engine level ("... but the proxy did not
 * return its actual value"). Prisma 5.7's internal transaction-client
 * object exposes `_extensions` (used by `$extends`) with exactly this
 * shape; this check is general rather than `_extensions`-specific since
 * there may be other properties like it. Accessor (getter/setter)
 * descriptors have no `writable` key at all, so they never match here.
 */
function isNonConfigurableReadonlyOwnProperty(target: object, prop: PropertyKey): boolean {
  const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
  return descriptor?.configurable === false && descriptor?.writable === false;
}

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
        // Deliberately NOT applying isNonConfigurableReadonlyOwnProperty
        // here: delete/deleteMany are always plain configurable, writable
        // methods on a Prisma model delegate today, and this branch's
        // whole purpose is to substitute a throwing closure for the real
        // method. Skipping the substitution on that check firing would
        // mean returning Prisma's real, callable delete method — an actual
        // guardrail bypass, the opposite of what QUIKTR-118 exists to
        // prevent. If this shape is ever hit here, the correct outcome is
        // a Proxy invariant TypeError (fail-closed), not a silent bypass.
        return () => {
          throw new McpDeleteGuardrailError(prop);
        };
      }
      return Reflect.get(target, prop, target);
    },
  });
}

export function guardClient<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "$transaction") {
        // Same invariant as below — if $transaction is itself frozen on
        // this target, substituting our wrapped version would violate it.
        if (isNonConfigurableReadonlyOwnProperty(target, prop)) {
          return Reflect.get(target, prop, target);
        }
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
        // Wrapping a non-configurable, non-writable property (e.g. Prisma's
        // internal `_extensions` on a tx client) in guardModelDelegate would
        // violate the Proxy get-trap invariant and throw. Nothing to guard
        // there anyway — this shape only occurs on Prisma-internal,
        // non-model properties, never on an actual model delegate.
        if (isNonConfigurableReadonlyOwnProperty(target, prop)) {
          return value;
        }
        return guardModelDelegate(value);
      }
      return value;
    },
  });
}

export const mcpDb = guardClient(db);
