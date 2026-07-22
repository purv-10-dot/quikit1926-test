import { NextResponse } from 'next/server';
import { route, json } from '@/lib/http';
import {
  findIssuedByCertificateId,
  downloadGateBlocked,
  regeneratePdfByCertificateId,
} from '@/lib/services/certificates-service';

/**
 * GET /api/verify-certificate/:certificateId/download — PUBLIC (no auth)
 *
 * Generates a real PDF (jsPDF + QR) for public certificate verification.
 *
 * PASS GATE. The authenticated sibling (`/certificates/:id/download`) refuses a
 * certificate whose learner did not meet the passing criteria, but this public
 * route did not — so anyone holding a certificate id could pull the PDF for a
 * FAILED learner, which is exactly the artefact the gate exists to withhold.
 * The id is guessable-adjacent (`CERT-<epoch ms>-<9 base36 chars>`) and appears
 * in verification links, so "you need the id" was never the control.
 *
 * The gate is applied here rather than inside `regeneratePdfByCertificateId`
 * so the service stays reusable by admin paths that legitimately bypass it.
 */
export const GET = route(async (_req, { params }) => {
  try {
    const issued = await findIssuedByCertificateId(params!.certificateId);
    if (!issued) return json({ success: false, message: 'Certificate not found' }, 404);
    if (downloadGateBlocked(issued)) {
      return json(
        { success: false, message: 'You need to meet the passing criteria to download the certificate.' },
        403,
      );
    }

    const { buffer, certificate } = await regeneratePdfByCertificateId(params!.certificateId);
    const filename = `Certificate_${certificate.certificateId}.pdf`;
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': body.length.toString() },
    });
  } catch (error) {
    return json({ success: false, message: error instanceof Error ? error.message : 'Certificate not found' }, 404);
  }
});
