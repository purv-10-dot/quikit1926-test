import type { NextRequest } from "next/server";
import { verifyJWT } from "./jwt";

export interface AuthContext {
  userId: string;
  /** Active tenant/org id from JWT — isolation key for tenant-scoped queries. */
  orgId: string;
  orgRole: string;
  permissions: string[];
  isSuperAdmin: boolean;
  email: string | null;
}

export async function withAuth(req: NextRequest): Promise<AuthContext> {
  const token = await verifyJWT(req);
  if (!token?.id) {
    throw new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const orgId = token.orgId as string | undefined;
  if (!orgId) {
    throw new Response(
      JSON.stringify({ success: false, error: "No organization selected" }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  }
  return {
    userId: token.id as string,
    orgId,
    orgRole: (token.membershipRole as string | undefined) ?? "member",
    permissions: (token as unknown as { permissions?: string[] }).permissions ?? [],
    isSuperAdmin: Boolean(token.isSuperAdmin),
    email: (token.email as string | undefined) ?? null,
  };
}

export async function withAuthOptional(req: NextRequest): Promise<AuthContext | null> {
  try {
    return await withAuth(req);
  } catch {
    return null;
  }
}
