/**
 * Attachment uploads for support requests raised from QuikVC.
 *
 * POST — multipart `files`, stored in Google Cloud Storage under
 *        `support/<orgId>/<yyyy-mm>/<random><ext>`. Returns descriptors the
 *        client echoes back on POST /api/support/tickets.
 *
 * The validation, key layout and GCS calls live in
 * `@quikit/shared/supportAttachments` and are identical in every app; this
 * file only supplies QuikVC's auth guard.
 *
 * Not permission-gated, matching the ticket route: a user locked out of a
 * module must still be able to show us the screen that locked them out.
 * Uploads land under the caller's own org prefix, which is what the viewer
 * route checks before it will sign anything.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { handleSupportUpload } from "@quikit/shared/supportAttachments";

export const POST = withOrgAuth(
  async ({ orgId }, req: NextRequest) => {
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
  },
  { fallbackErrorMessage: "Failed to upload attachment" },
);
