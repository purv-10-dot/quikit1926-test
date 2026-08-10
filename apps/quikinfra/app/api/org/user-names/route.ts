import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { listUsersCentral } from "@/lib/users/central-repository";

/**
 * GET /api/org/user-names
 *
 * Minimal id → display-name map for the caller's org, used to render audit
 * columns (Created By / Updated By) without leaking raw cuids into the UI.
 *
 * Deliberately gated on authentication only — NOT on user-management
 * permission. `/api/settings/users` is `auth.manage`, so a site user reading
 * a Material Issue grid cannot call it, which is why every non-admin used to
 * see a raw id in those columns. Display names are already visible to any
 * member through approval timelines, so exposing id + name (and nothing else)
 * org-wide adds no new disclosure.
 */
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const users = await listUsersCentral(ctx.orgId, { status: "all" });

  return NextResponse.json(
    {
      data: users.map((u) => ({
        id: u.id,
        name: u.fullName?.trim() || u.email || u.id,
      })),
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
