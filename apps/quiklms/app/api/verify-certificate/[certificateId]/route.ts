import { route, json } from '@/lib/http';
import { verifyCertificate, toPublicVerification } from '@/lib/services/certificates-service';

/**
 * GET /api/verify-certificate/:certificateId — PUBLIC (no auth).
 *
 * Two corrections here:
 *
 * 1. PAYLOAD (F-004). The response is shaped by `toPublicVerification`, which
 *    drops the holder's email, their internal user id, the orgId and their exam
 *    score. Certificate ids are meant to be shared — printed on the PDF, posted
 *    publicly — so anything returned alongside one is effectively public.
 *
 * 2. STATUS (F-012). An unknown certificate returned HTTP **200** with
 *    `{success:false}`, because `json()` defaults to 200 when no status is
 *    passed. The sibling `/download` route already answered 404, so the public
 *    API contradicted itself and any caller branching on status treated a
 *    forged id as a successful verification.
 */
export const GET = route(async (_req, { params }) => {
  try {
    const certificate = await verifyCertificate(params!.certificateId);
    if (!certificate) return json({ success: false, message: 'Certificate not found' }, 404);
    return json({
      success: true,
      data: toPublicVerification(certificate as unknown as Record<string, unknown>),
    });
  } catch (error) {
    return json(
      { success: false, message: error instanceof Error ? error.message : 'Failed to verify certificate' },
      500,
    );
  }
});
