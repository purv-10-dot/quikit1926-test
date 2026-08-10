/**
 * Attachment uploads for support requests raised from QuikChat.
 *
 * POST — multipart `files`, stored in Google Cloud Storage under
 *        `support/<orgId>/<yyyy-mm>/<random><ext>`. Returns descriptors the
 *        client echoes back on POST /api/support/tickets.
 *
 * The validation, key layout and GCS calls live in
 * `@quikit/shared/supportAttachments` and are identical in every app; this
 * file only supplies QuikChat's auth guard.
 *
 * Not permission-gated, matching the ticket route: a user locked out of a
 * module must still be able to show us the screen that locked them out.
 * Uploads land under the caller's own org prefix, which is what the viewer
 * route checks before it will sign anything.
 */

import { withOrgAuth } from "@/lib/orgAuth";
import { handleSupportUpload } from "@quikit/shared/supportAttachments";

export const POST = withOrgAuth(async (req, { orgId }) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { success: false, error: "Expected multipart/form-data body" },
      { status: 400 },
    );
  }

  const result = await handleSupportUpload({ orgId, form });
  if (!result.ok) {
    return Response.json({ success: false, error: result.error }, { status: result.status });
  }
  return Response.json({ success: true, data: result.data }, { status: 201 });
});
