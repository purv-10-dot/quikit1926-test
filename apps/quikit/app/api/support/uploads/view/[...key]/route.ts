/**
 * Attachment viewer.
 *
 * Rows store the GCS object KEY, never a URL — bucket objects are private and
 * signed URLs expire in minutes, so a persisted URL would be dead on arrival.
 * This route re-signs on every request and redirects.
 *
 * Tenant isolation: the key layout is `support/<orgId>/<yyyy-mm>/<file>` and
 * `handleSupportAttachmentView` rejects anything whose org segment isn't the
 * caller's, with a 404 rather than a 403 so the route is not an existence
 * oracle for other tenants' keys.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { handleSupportAttachmentView } from "@quikit/shared/supportAttachments";

export async function GET(_req: Request, { params }: { params: { key: string[] } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const orgId = session.user.orgId;
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "No organisation selected" },
        { status: 403 },
      );
    }

    const result = await handleSupportAttachmentView({ orgId, keySegments: params.key ?? [] });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.redirect(result.data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to open attachment";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
