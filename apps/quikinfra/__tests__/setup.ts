import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Tenant-context injection for tests
// ---------------------------------------------------------------------------
// QuikInfra resolves auth through ONE function — `getTenantContext()` in
// `@/lib/auth/context`. Every route gate funnels through it:
//
//   - `requireMastersAction` / `requirePurchaseAction` / `requireStoreAction`
//     (separate modules) import `getTenantContext` from this module.
//   - `withListRoute` / `withMutationRoute` (in `@/lib/http`) import
//     `getTenantContext` + `hasPermission` + `hasMatrixAction` from here.
//   - `requirePermission` & friends live IN this module.
//
// So mocking THIS module is the single control surface for auth. We replace
// it with a self-contained stub (no `importActual`) — that keeps the heavy
// RBAC dependency tree (seedDefaultRoles, userCan, project-access, etc.) out
// of the test graph entirely. The pure helpers below are reproduced verbatim
// from the real module so route behaviour is identical.

export interface TestContext {
  userId: string;
  userEmail: string;
  userName: string;
  orgId: string;
  roleKey: string;
  userType: string | null;
  permissions: Set<string>;
  projectIds?: string[];
  modulesAssigned: string[] | null;
  permissionMatrix: Record<string, Record<string, boolean>> | null;
}

const _state: { ctx: TestContext | null } = { ctx: null };

/** Set (or clear, with `null`) the tenant context returned by every auth gate. */
export function setContext(ctx: TestContext | null) {
  _state.ctx = ctx;
}

const TENANT = "org-test-1";
const USER = "user-test-1";

/** A full-access central admin context — holds the `*` wildcard. */
export function makeAdminCtx(over: Partial<TestContext> = {}): TestContext {
  return {
    userId: USER,
    userEmail: "admin@test.io",
    userName: "Admin",
    orgId: TENANT,
    roleKey: "admin",
    userType: "ADMIN",
    permissions: new Set<string>(["*"]),
    projectIds: undefined,
    modulesAssigned: null,
    permissionMatrix: null,
    ...over,
  };
}

/** A scoped user context holding exactly the permission keys passed in. */
export function makeUserCtx(
  permissions: string[] = [],
  over: Partial<TestContext> = {},
): TestContext {
  return {
    userId: USER,
    userEmail: "user@test.io",
    userName: "User",
    orgId: TENANT,
    roleKey: "user",
    userType: "USER",
    permissions: new Set<string>(permissions),
    projectIds: undefined,
    modulesAssigned: null,
    permissionMatrix: null,
    ...over,
  };
}

export { TENANT as TEST_TENANT, USER as TEST_USER };

// ---------------------------------------------------------------------------
// Mock of @/lib/auth/context — self-contained, no real module loaded.
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth/context", async () => {
  const { NextResponse } = await vi.importActual<typeof import("next/server")>(
    "next/server",
  );

  const unauthorized = (msg = "Authentication required") =>
    NextResponse.json({ error: msg, code: "UNAUTHORIZED" }, { status: 401 });
  const forbidden = (msg = "Forbidden") =>
    NextResponse.json({ error: msg, code: "FORBIDDEN" }, { status: 403 });
  const badRequest = (msg: string, details?: unknown) =>
    NextResponse.json({ error: msg, code: "BAD_REQUEST", details }, { status: 400 });
  const notFound = (msg = "Not found") =>
    NextResponse.json({ error: msg, code: "NOT_FOUND" }, { status: 404 });

  const getTenantContext = vi.fn(async () => _state.ctx);

  const hasPermission = (ctx: TestContext, key: string) =>
    ctx.permissions.has("*") || ctx.permissions.has(key);

  const hasMatrixAction = (
    ctx: TestContext,
    menuKey: string,
    action: string,
  ) => {
    if (ctx.permissions.has("*")) return true;
    const matrix = ctx.permissionMatrix;
    if (!matrix) return true;
    const row = matrix[menuKey];
    if (!row) return true;
    return row[action] !== false;
  };

  const requireAuth = async () => _state.ctx ?? unauthorized();
  const requirePermission = async (
    key: string,
    opts?: { matrix?: { menuKey: string; action: string } },
  ) => {
    const ctx = _state.ctx;
    if (!ctx) return unauthorized();
    if (!hasPermission(ctx, key)) return forbidden(`Missing permission: ${key}`);
    if (opts?.matrix && !hasMatrixAction(ctx, opts.matrix.menuKey, opts.matrix.action)) {
      return forbidden(`Action "${opts.matrix.action}" not allowed for ${opts.matrix.menuKey}`);
    }
    return ctx;
  };
  const requireAnyPermission = async (keys: readonly string[]) => {
    const ctx = _state.ctx;
    if (!ctx) return unauthorized();
    if (ctx.permissions.has("*")) return ctx;
    if (keys.some((k) => ctx.permissions.has(k))) return ctx;
    return forbidden(`Missing any of: ${keys.join(", ")}`);
  };
  const requireAllPermissions = async (keys: string[]) => {
    const ctx = _state.ctx;
    if (!ctx) return unauthorized();
    if (ctx.permissions.has("*")) return ctx;
    const missing = keys.filter((k) => !ctx.permissions.has(k));
    if (missing.length) return forbidden(`Missing: ${missing.join(", ")}`);
    return ctx;
  };
  const requireRole = async (roleKeys: string[]) => {
    const ctx = _state.ctx;
    if (!ctx) return unauthorized();
    if (ctx.roleKey === "super_admin" || ctx.roleKey === "admin") return ctx;
    if (roleKeys.includes(ctx.roleKey)) return ctx;
    return forbidden(`Role ${ctx.roleKey} not allowed. Need one of: ${roleKeys.join(", ")}`);
  };

  const tenantWhere = (ctx: TestContext, extra: Record<string, unknown> = {}) => ({
    orgId: ctx.orgId,
    ...extra,
  });
  const tenantCreate = (ctx: TestContext, data: Record<string, unknown>) => {
    const { orgId: _a, createdBy: _b, updatedBy: _c, ...rest } = data;
    return { ...rest, orgId: ctx.orgId, createdBy: ctx.userId, updatedBy: ctx.userId };
  };
  const tenantUpdate = (ctx: TestContext, data: Record<string, unknown>) => {
    const { orgId: _a, createdBy: _b, ...rest } = data;
    return { ...rest, updatedBy: ctx.userId };
  };

  return {
    getTenantContext,
    requireAuth,
    requirePermission,
    requireAnyPermission,
    requireAllPermissions,
    requireRole,
    hasPermission,
    hasMatrixAction,
    unauthorized,
    forbidden,
    badRequest,
    notFound,
    tenantWhere,
    tenantCreate,
    tenantUpdate,
  };
});

// ---------------------------------------------------------------------------
// Observability stubs (for any module that imports these via ESM `import`)
// ---------------------------------------------------------------------------
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// @/lib/http/errors — faithful reimplementation (no observability require)
// ---------------------------------------------------------------------------
// The real `toHttpResponse` lazily `require()`s the logger + sentry modules.
// A bare runtime `require("@/…")` inside an ESM module can't be intercepted by
// Vitest (ESM modules don't get Vitest's `require` shim) and Node can't resolve
// the `@/` alias — so it throws "Cannot find module". The wrapper error path
// (`withMutationRoute` → `safeRun` → `toHttpResponse`) hits this on every
// validation / Prisma error. We mock the module with an identical
// DomainError + envelope mapping (using the REAL envelope `err`), so the
// status/shape contract is exercised exactly, minus the logging side-effect.
vi.mock("@/lib/http/errors", async () => {
  const { err: envErr, ok: envOk } = await vi.importActual<
    typeof import("@/lib/http/envelope")
  >("@/lib/http/envelope");

  class DomainError extends Error {
    code: string;
    httpStatus: number;
    details?: Record<string, unknown>;
    isOperational: boolean;
    constructor(
      code: string,
      message: string,
      httpStatus = 400,
      options: { details?: Record<string, unknown>; isOperational?: boolean } = {},
    ) {
      super(message);
      this.name = "DomainError";
      this.code = code;
      this.httpStatus = httpStatus;
      this.details = options.details;
      this.isOperational = options.isOperational ?? true;
    }
  }

  function isDomainError(e: unknown): e is DomainError {
    if (e instanceof DomainError) return true;
    if (!e || typeof e !== "object") return false;
    const x = e as any;
    return (
      typeof x.code === "string" &&
      typeof x.httpStatus === "number" &&
      typeof x.message === "string"
    );
  }

  function toHttpResponse(error: unknown) {
    if (isDomainError(error)) {
      return envErr(error.code, error.message, error.httpStatus, error.details);
    }
    return envErr(
      "INTERNAL_ERROR",
      "An internal error occurred. The incident has been logged.",
      500,
    );
  }

  return { DomainError, isDomainError, toHttpResponse, ok: envOk };
});

// ---------------------------------------------------------------------------
// next/navigation stubs (component tests import useRouter, etc.)
// ---------------------------------------------------------------------------
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// ---------------------------------------------------------------------------
// next-auth/react stub (client components that read useSession)
// ---------------------------------------------------------------------------
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: _state.ctx ? { user: { id: _state.ctx.userId, orgId: _state.ctx.orgId } } : null,
    status: _state.ctx ? "authenticated" : "unauthenticated",
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ---------------------------------------------------------------------------
// Silence expected route-handler error logs
// ---------------------------------------------------------------------------
// Route handlers call console.error before returning a 4xx/5xx. During tests
// those logs are noise AND Vitest's console interception can choke while
// serializing certain error shapes. Stub it; tests can opt in with vi.spyOn.
vi.spyOn(console, "error").mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  _state.ctx = null;
});

afterEach(() => {
  cleanup();
});
