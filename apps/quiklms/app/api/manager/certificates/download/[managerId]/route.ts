import { NextResponse } from 'next/server';
import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { buildTeamCertificatesZip } from '@/lib/services/manager-export-service';

// GET /api/manager/certificates/download/:managerId — MANAGER
//
// Returns a real ZIP of the team's certificate PDFs. The port previously
// returned the JSON records with no Content-Disposition, so the browser rendered
// JSON where an <a download> expected an archive.
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  if (user.id !== params!.managerId) {
    return json({ success: false, message: 'You can only download certificates for your own team' }, 403);
  }

  const { buffer, filename, contentType } = await buildTeamCertificatesZip(params!.managerId, user.orgId as string);
  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': body.length.toString(),
      'Cache-Control': 'no-store',
    },
  });
});
