/**
 * Attachment uploads for support requests raised from the QuikIT launcher.
 *
 * POST — multipart `files`, stored in Google Cloud Storage under
 *        `support/<orgId>/<yyyy-mm>/<random><ext>`. Returns descriptors the
 *        client echoes back on POST /api/support/tickets.
 *
 * The validation, key layout and GCS calls live in
 * `@quikit/shared/supportAttachments` and are identical in every app; this
 * file only supplies the QuikIT launcher's auth guard.
 *
 * Not permission-gated, matching the ticket route: a user locked out of a
 * module must still be able to show us the screen that locked them out.
 * Uploads land under the caller's own org prefix, which is what the viewer
 * route checks before it will sign anything.
 *
 * The launcher is where a user lands when an app won't let them in, so this is
 * the one place someone with no app access at all can still send us a
 * screenshot.
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
        { success: false, error: "No organisation selected" },
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
