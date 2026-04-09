# QuikIT Development Standards

## Prisma Query Standard

- Use `select` for API endpoints that return lists (reduces payload size)
- Use `include` only when you need the full related model for business logic
- Always filter by `tenantId` on every query (except super-admin cross-tenant operations)
- Use the shared pagination utility from `@quikit/shared/pagination` for list endpoints

```typescript
// GOOD: List endpoint with select
const items = await db.kpi.findMany({
  where: { tenantId },
  select: { id: true, name: true, owner: { select: { id: true, firstName: true } } },
  ...paginationToSkipTake(params),
});

// GOOD: Detail endpoint with include (need full model)
const item = await db.kpi.findUnique({
  where: { id, tenantId },
  include: { owner: true, weeklyValues: true },
});
```

## API Route Pattern

All API routes must follow this structure:

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET() {
  try {
    // 1. Auth guard (getTenantId, requireAdmin, or requireSuperAdmin)
    // 2. Input validation (Zod schemas)
    // 3. Database query with tenantId filter
    // 4. Return { success: true, data }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
```

- Always use `catch (error: unknown)` — never `catch (e: any)`
- Always use `NextRequest` type for request parameters, not `Request`
- POST returns 201 on creation, all others return 200
- Error responses always include `{ success: false, error: string }`

## File Naming Conventions

- Directories: `lowercase` (e.g., `components/dashboard/`, not `Dashboard/`)
- Component files: `lowercase.tsx` (e.g., `sidebar.tsx`, not `Sidebar.tsx`)
- Exports: PascalCase for components (e.g., `export function Sidebar`)
- Route files: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`

## Shared Package Imports

- UI components: Import from `@quikit/ui` — NEVER create local copies
- Constants (ROLES, ROLE_HIERARCHY, etc.): Import from `@quikit/shared`
- Auth guards: Import factories from `@quikit/auth/*`, wrap in thin `lib/api/` files
- Database: Import `db` from `@quikit/database` or local `@/lib/db` re-export

## Provider Order (all apps)

```
SessionProvider → QueryClientProvider → ThemeProvider
```

## Middleware

All apps must use `createMiddleware()` from `@quikit/auth/middleware` — no custom middleware logic.

## Login Routes

All apps use `/login` as the login route (not `/auth/login`).

## CSS/Theming

- All apps import `@quikit/ui/styles` in their `globals.css`
- App-specific styles go after the import
- Tailwind configs extend from `@quikit/ui/tailwind-config`
- Use CSS variables (e.g., `bg-[var(--color-bg-secondary)]`) — never hardcode colors like `bg-gray-50`
