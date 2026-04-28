# Testing

Vitest for unit/component/API tests. Playwright for end-to-end. Coverage ratchet enforced in CI.

## When tests are required

- **Every bug fix** ships with a regression test that fails before the fix and passes after. No exceptions.
- **Every new API route** has at minimum: 401 for unauthenticated, tenant-isolation rejection, happy path.
- **Every new shared utility** under `lib/utils/` reaches ≥ 90% line coverage in its own test file.
- **Every new permission helper** has admin/team-head/self/other matrix coverage.

PRs missing required tests get rejected at review.

## Test file conventions

| Path | Environment | Purpose |
|---|---|---|
| `__tests__/unit/*.test.ts` | node | Pure functions, no mocks |
| `__tests__/permissions/*.test.ts` | node + `vitest-mock-extended` | DB-touching permission logic |
| `__tests__/api/*.test.ts` | node + mocked Prisma + mocked session | Route handlers, called directly |
| `__tests__/components/*.dom.test.tsx` | jsdom (via directive) | React components |
| `__tests__/e2e/*.spec.ts` | Playwright (excluded from Vitest) | Full-stack flows |

## A unit test (no mocks)

```ts
// __tests__/unit/calculatePct.test.ts
import { describe, it, expect } from "vitest";
import { calculatePct } from "@/lib/utils/calculatePct";

describe("calculatePct()", () => {
  it("returns null when target is null", () => {
    expect(calculatePct(null, 50)).toBeNull();
  });

  it("returns 100 when achieved equals target", () => {
    expect(calculatePct(50, 50)).toBe(100);
  });

  it("rounds to 1 decimal", () => {
    expect(calculatePct(33, 100)).toBe(33);
    expect(calculatePct(33.4, 100)).toBe(33.4);
  });
});
```

Pure function tests are the cheapest insurance. Write them first when the logic is non-trivial.

## An API route test (with mocked DB + session)

```ts
// __tests__/api/widgets.test.ts
import { describe, it, expect, vi } from "vitest";
import { setSession, mockDb } from "../helpers";
import { GET, POST } from "@/app/api/widgets/route";

describe("GET /api/widgets", () => {
  it("rejects unauthenticated callers with 401", async () => {
    setSession(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns only the caller's tenant widgets", async () => {
    setSession({ user: { id: "u1", tenantId: "t1" } });
    mockDb.widget.findMany.mockResolvedValue([
      { id: "w1", name: "A", tenantId: "t1" },
    ]);
    const res = await GET();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockDb.widget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1" } }),
    );
  });

  it("rejects cross-tenant access (uses tenantId from session)", async () => {
    setSession({ user: { id: "u1", tenantId: "t1" } });
    await GET();
    const call = mockDb.widget.findMany.mock.calls[0][0];
    expect(call.where.tenantId).toBe("t1");
    // Verifies that even if a hypothetical query parameter is present,
    // the tenantId from the session always takes precedence.
  });
});

describe("POST /api/widgets", () => {
  it("validates input with Zod", async () => {
    setSession({ user: { id: "u1", tenantId: "t1" } });
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ name: "" }),  // invalid
    }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates with tenantId + createdBy from session", async () => {
    setSession({ user: { id: "u1", tenantId: "t1" } });
    mockDb.widget.create.mockResolvedValue({ id: "w1", name: "test" });
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    }) as any;
    await POST(req);
    expect(mockDb.widget.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "t1", createdBy: "u1" }),
      }),
    );
  });
});
```

## A component test (jsdom)

```tsx
// __tests__/components/widget-card.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WidgetCard } from "@/components/widget-card";

describe("<WidgetCard />", () => {
  it("renders the widget name", () => {
    render(<WidgetCard widget={{ id: "w1", name: "Hello" }} onSelect={vi.fn()} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(<WidgetCard widget={{ id: "w1", name: "X" }} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("w1");
  });
});
```

The `// @vitest-environment jsdom` directive at the top is **required** for component tests. Without it, `document` and `window` are undefined.

## Mocking rules

- **Prisma**: mock via `__tests__/helpers/mockDb.ts` which `vi.mock`'s both `@quikit/database` and `@/lib/db`. Preserve `@prisma/client` enum re-exports via `vi.importActual`.
- **Sessions**: use `setSession(user)` from `__tests__/helpers/session.ts` — it stubs `getServerSession` from both `next-auth` and `next-auth/next`.
- **Factory auth helpers** (`createGetTenantId`, `createRequireAdmin`): instantiate the factory in your test with a stub `authOptions`; the mocked `getServerSession` does the rest.
- **Never** mock the module under test. Never mock individual route handlers — import them and call directly with a constructed `NextRequest`.

## Helpers you can use

You'll see references to `__tests__/helpers/` in quikscale and admin. Your app should mirror that structure:

```
apps/<your-app>/
  __tests__/
    setup.ts
    helpers/
      session.ts          # setSession()
      mockDb.ts           # mockDb proxy + vi.mock setup
      buildRequest.ts     # creates NextRequest with body/query
```

Copy these from `apps/quikscale/__tests__/helpers/` when scaffolding your test infrastructure. The integration owner will spot-check that you reused them rather than reinventing.

## Running tests

```bash
# All tests in your app
cd apps/<your-app> && npm run test

# Watch mode while developing
cd apps/<your-app> && npm run test:watch

# Vitest UI (browser-based dashboard)
cd apps/<your-app> && npm run test:ui

# Type check (no test runs)
npm run typecheck

# Lint
npm run lint
```

CI runs all three. Locally, run all three before pushing.

## Coverage

Coverage is collected on every test run. The ratchet script compares against a checked-in baseline:

```
coverage-baseline.json
```

CI fails if coverage drops > 0.25 percentage points on any of: lines, statements, functions, branches.

To intentionally raise the baseline (after adding tests):
```bash
npm run test -- --coverage
node scripts/coverage-ratchet.mjs apps/<your-app>/coverage/coverage-summary.json --update
git add coverage-baseline.json
git commit -m "chore: ratchet coverage baseline"
```

Don't lower the baseline. Don't disable coverage on a PR. If you delete code, the ratchet re-bases automatically.

## E2E tests (Playwright)

E2E tests live in `__tests__/e2e/*.spec.ts` and are excluded from Vitest. They run separately:

```bash
npm run e2e          # all e2e
npm run e2e:install  # one-time setup (downloads Chromium)
npm run db:seed:e2e  # resets the e2e tenant fixture
```

E2E coverage is light — focus on the 1–2 highest-value flows in your app (sign-in → home → primary action). Don't try to e2e every screen; that's what unit + component tests are for.

## Common test rejections

- ❌ New API route without a 401 unauthenticated test.
- ❌ New API route without a tenant-isolation test.
- ❌ Component test missing `// @vitest-environment jsdom` directive.
- ❌ Re-implemented `setSession` / `mockDb` instead of using the helpers.
- ❌ Test that asserts on rendered text from a sandboxed iframe (not testable; the dom-test should test the wrapper, not the iframe content).
- ❌ Coverage drop without explanation.
- ❌ E2E test that depends on production data.

## See also

- `docs/03-api-patterns.md` — what the routes look like.
- `apps/quikscale/__tests__/` — large existing test suite to learn from.
- `vitest.config.ts` in your app — adjust aliases, never test config.
