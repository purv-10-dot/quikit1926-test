import { NextResponse } from "next/server";
import { createRequireAdmin } from "@quikit/auth/require-admin";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasQuikChatAccess } from "./appAccess";
import { getQuikChatAppId } from "./permissions";

/**
 * Admin bridge for QuikChat RBAC v2 (mirrors apps/quikscale/lib/api/requireAdmin.ts).
 *
 * The shared `createRequireAdmin` factory only knows the legacy platform tier
 * (OrgMember.role). A user promoted to admin purely via QuikChat's dynamic RBAC
 * (a `QcUserAppRole` → system `QcAppRole` named "admin") keeps their legacy
 * membership role, so the bare factory would 403 them. `extraAdminCheck`
 * recognises the v2 admin grant for THIS org's QuikChat app — lowercase
 * `"admin"`, matching the seeded row and `isOrgAdmin`.
 *
 * Live call sites (Phase 3 shipped): the `/settings/roles` page and the four
 * `/api/org/roles/*` route handlers.
 */
export async function extraAdminCheck({
  userId,
  orgId,
}: {
  userId: string;
  orgId: string;
}): Promise<boolean> {
  const appId = await getQuikChatAppId();
  if (!appId) return false;
  const v2Admin = await db.qcUserAppRole.findFirst({
    where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
    select: { id: true },
  });
  return !!v2Admin;
}

const baseRequireAdmin = createRequireAdmin(authOptions, { extraAdminCheck });

/**
 * Admin gate for QuikChat's admin-tier routes: the shared factory's checks
 * (session → org → active membership → admin tier / v2 grant) PLUS QuikChat
 * entitlement.
 *
 * The entitlement half exists because these four `/api/org/roles/*` handlers do
 * not go through `withOrgAuth`, so they never reached the app-access assertion
 * added there — while the `/settings/roles` PAGE they serve has always been
 * gated by `(dashboard)/layout.tsx`. The page was protected and its APIs were
 * not.
 *
 * NOT a widening of who counts as admin, and not a narrowing for anyone who
 * should be here: `getAppAccess` rule 3 passes org admins and super admins on
 * org-level entitlement alone, so an admin of an org that HAS QuikChat is
 * unaffected. The only newly-rejected caller is an admin of an org where
 * QuikChat is disabled or its trial has expired — who has no QuikChat roles to
 * configure, and who already could not open the page.
 *
 * Order matters: entitlement is checked AFTER the factory, so a non-admin still
 * gets the factory's 401/403 rather than leaking that the org lacks the app.
 */
export const requireAdmin: typeof baseRequireAdmin = async () => {
  const gate = await baseRequireAdmin();
  if ("error" in gate) return gate;

  const user = gate.session.user as
    | { isSuperAdmin?: boolean; membershipRole?: string }
    | undefined;
  const allowed = await hasQuikChatAccess({
    userId: gate.userId,
    orgId: gate.orgId,
    isSuperAdmin: user?.isSuperAdmin === true,
    // Prefer the live membership row over the JWT claim: this row was just read
    // by the factory, and a long-lived token can carry a stale role.
    memberRole: gate.membership.role ?? user?.membershipRole,
  });
  if (allowed) return gate;

  return {
    error: NextResponse.json(
      { success: false, error: "QuikChat access required" },
      { status: 403 },
    ),
  };
};
