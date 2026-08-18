import { NextResponse } from 'next/server';
import { route, json } from '@/lib/http';
import { requireAuth, requireRoles, userHasRole } from '@/lib/auth/context';
import { findIssuedById, downloadGateBlocked, regeneratePdfForIssuedCertificate } from '@/lib/services/certificates-service';

// GET /api/certificates/:id/download — ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER | LEARNER
//
// The PDF is always regenerated fresh against the tenant's current template, so
// private-bucket images are embedded and an old template is never served.
//
// The tenant-isolation and own-certificate checks below are HARDENING, not a
// port: the legacy handler (`certificates.controller.ts:630-690`) gated on role
// alone and let ANY authenticated learner download ANY certificate by id.
//
// Ownership is required of everyone except the three admin roles (product owner,
// 2026-07-17). MANAGER is deliberately NOT exempt: the manager certificates page
// lists `/certificates/my-certificates` — the manager's own — so it keeps
// working, and team-wide download has its own endpoint
// (`/manager/certificates/download/:managerId`).
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'LEARNER']);
  if (!user.id) return json({ success: false, message: 'User ID is required' }, 400);

  const issued = await findIssuedById(params!.id).catch(() => null);
  if (!issued) {
    return json({ success: false, message: 'Certificate not found' }, 404);
  }
  // Tenant isolation: non-super-admins may only download certs in their tenant.
  if (user.orgId && issued.orgId !== user.orgId) {
    return json({ success: false, message: 'Certificate not found' }, 404);
  }
  // Everyone below tenant-admin may only download their OWN certificate.
  // `userHasRole` so a secondary admin role still grants the exemption.
  const isAdminActor =
    userHasRole(user, 'ADMIN') || userHasRole(user, 'TENANT_ADMIN') || userHasRole(user, 'SUB_ADMIN');
  if (!isAdminActor && issued.learnerId !== user.id) {
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
