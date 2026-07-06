import { NextResponse } from 'next/server';
import { route, json } from '@/lib/http';
import { regeneratePdfByCertificateId } from '@/lib/services/certificates-service';

// GET /api/verify-certificate/:certificateId/download — PUBLIC (no auth)
// Generates a real PDF (jsPDF + QR) for public certificate verification.
export const GET = route(async (_req, { params }) => {
  try {
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
