/**
 * Signed-URL redirect for a support attachment, for QuikCRMExpress.
 *
 * Tenant isolation: the key layout is `support/<orgId>/<yyyy-mm>/<file>` and
 * `handleSupportAttachmentView` rejects anything whose org segment isn't the
 * caller's, with a 404 rather than a 403 so the route is not an existence
 * oracle for other tenants' keys.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleSupportAttachmentView } from "@quikit/shared/supportAttachments";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export async function GET(
  _req: NextRequest,
  { params }: { params: { key: string[] } },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const result = await handleSupportAttachmentView({
      orgId: user.orgId,
      keySegments: params.key ?? [],
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.redirect(result.data);
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
