/**
 * GET /api/accounts/acl-scope — used by the AccountAclBanner so the UI can
 * show the discoverability hint when the caller is ACL-restricted.
 *
 * Returns: { unrestricted: true } | { unrestricted: false, count: number }.
 */
import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getScope } from "@/lib/auth/account-acl";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const scope = await getScope(user);
    if (scope.unrestricted)
      return NextResponse.json({ success: true, data: { unrestricted: true } });
    return NextResponse.json({
      success: true,
      data: {
        unrestricted: false,
        count: scope.allowedAccountIds.length,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
