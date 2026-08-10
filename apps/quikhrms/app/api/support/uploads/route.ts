/**
 * Attachment uploads for support requests raised from QuikHRMS.
 *
 * POST — multipart `files`, stored in Google Cloud Storage under
 *        `support/<orgId>/<yyyy-mm>/<random><ext>`. Returns descriptors the
 *        client echoes back on POST /api/support/tickets.
 *
 * The validation, key layout and GCS calls live in
 * `@quikit/shared/supportAttachments` and are identical in every app; this
 * file only supplies QuikHRMS's auth guard.
 *
 * Not permission-gated, matching the ticket route: a user locked out of a
 * module must still be able to show us the screen that locked them out.
 * Uploads land under the caller's own org prefix, which is what the viewer
 * route checks before it will sign anything.
 *
 * Reads the CENTRAL session rather than HRMS's `withAuth`, for the same reason
 * as the ticket route: that wrapper hands the handler an `Employee.id`, while
 * support rows key on the central `auth.User.id`. Here it also matters for the
 * object key, which is namespaced by org.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { handleSupportUpload } from "@quikit/shared/supportAttachments";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const orgId = session.user.orgId;
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "No active membership" },
        { status: 403 },
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "Expected multipart/form-data body" },
        { status: 400 },
      );
    }

    const result = await handleSupportUpload({ orgId, form });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: result.data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to upload attachment";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
