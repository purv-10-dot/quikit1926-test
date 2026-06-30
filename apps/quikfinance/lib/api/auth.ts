import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { prisma } from "@/lib/prisma";
import { db, type DbClient } from "@/lib/db";

/**
 * Platform-integrated API context for finance routes.
 *
 * Original QuikFinance resolved identity from a local `profiles` table via
 * NextAuth v5 `auth()`. On the platform, identity comes from the central QuikIT
 * SSO session (NextAuth v4): `userId` from the session, `orgId` from the shared
 * membership lookup (getOrgId), `role` from the session's membership role. The
 * returned `ApiContext` shape is unchanged so finance route handlers using
 * `requireApiContext()` keep working without edits.
 */
export type ApiContext = {
  db: DbClient;
  prisma: typeof prisma;
  userId: string;
  orgId: string;
  role: string;
};

export type AuthResult =
  | { ok: true; context: ApiContext }
  | { ok: false; status: number; code: string; message: string };

export async function requireApiContext(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, status: 401, code: "UNAUTHENTICATED", message: "Sign in to continue." };
  }

  const orgId = await getOrgId(userId);
  if (!orgId) {
    return {
      ok: false,
      status: 403,
      code: "ORG_ACCESS_REQUIRED",
      message: "Your user is not assigned to an active organization."
    };
  }

  const role = (session.user as { membershipRole?: string }).membershipRole ?? "member";

  return {
    ok: true,
    context: { db, prisma, userId, orgId, role }
  };
}
