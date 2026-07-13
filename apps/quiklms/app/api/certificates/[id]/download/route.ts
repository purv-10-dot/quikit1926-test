import { NextResponse } from 'next/server';
import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findIssuedById, downloadGateBlocked, regeneratePdfForIssuedCertificate } from '@/lib/services/certificates-service';

// GET /api/certificates/:id/download — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER | LEARNER
// NOTE: PDF generation is DEFERRED — the regenerate helper returns an empty
// placeholder buffer (jsPDF/PDFKit + html-pdf-node generation to be added later).
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'LEARNER']);
  if (!user.id) return json({ success: false, message: 'User ID is required' }, 400);

  const issued = await findIssuedById(params!.id).catch(() => null);
  if (!issued) {
    return json({ success: false, message: 'Certificate not found' }, 404);
  }
  // Tenant isolation: non-super-admins may only download certs in their tenant.
  if (user.orgId && issued.orgId !== user.orgId) {
    return json({ success: false, message: 'Certificate not found' }, 404);
  }
  // Learners may only download their own certificate.
  if (user.role === 'LEARNER' && issued.learnerId !== user.id) {
    return json({ success: false, message: 'Certificate not found' }, 404);
  }
  if (downloadGateBlocked(issued)) {
    return json({ success: false, message: 'You need to meet the passing criteria to download the certificate.' }, 403);
  }

  try {
    const { buffer, certificate } = await regeneratePdfForIssuedCertificate(params!.id, user.orgId);
    const filename = `Certificate_${certificate.certificateId || params!.id}.pdf`;
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': body.length.toString() },
    });
  } catch (error) {
    return json({ success: false, message: error instanceof Error ? error.message : 'Certificate download failed' }, 404);
  }
});
