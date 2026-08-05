/**
 * Attachment uploads for support requests raised from QuikLMS.
 *
 * POST — multipart `files`, stored in Google Cloud Storage under
 *        `support/<orgId>/<yyyy-mm>/<random><ext>`. Returns descriptors the
 *        client echoes back on POST /api/support/tickets.
 *
 * The validation, key layout and GCS calls live in
 * `@quikit/shared/supportAttachments` and are identical in every app; this
 * file only supplies QuikLMS's auth guard.
 *
 * Not permission-gated, matching the ticket route: a user locked out of a
 * module must still be able to show us the screen that locked them out.
 * Uploads land under the caller's own org prefix, which is what the viewer
 * route checks before it will sign anything.
 */

import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { handleSupportUpload } from '@quikit/shared/supportAttachments';

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  if (!actor.orgId) throw BadRequest('Tenant ID required');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ success: false, error: 'Expected multipart/form-data body' }, 400);
  }

  const result = await handleSupportUpload({ orgId: actor.orgId, form });
  if (!result.ok) return json({ success: false, error: result.error }, result.status);

  return json({ success: true, data: result.data }, 201);
});
