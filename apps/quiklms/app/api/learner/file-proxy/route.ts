import { NextResponse } from 'next/server';
import { route, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';

// GET /api/learner/file-proxy?url= — proxy a remote HTTP(S) file (e.g. PDF) through the API.
export const GET = route(async (req) => {
  await requireAuth(req);
  const url = new URL(req.url).searchParams.get('url');
  if (!url) throw BadRequest('URL parameter is required');

  const decoded = decodeURIComponent(url);
  let parsed: URL;
  try { parsed = new URL(decoded); } catch { throw BadRequest('Invalid URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw BadRequest('Only HTTP/HTTPS URLs are supported');

  try {
    const upstream = await fetch(decoded);
    if (!upstream.ok) throw BadRequest('Failed to fetch file');
    const buf = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'application/pdf';
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600', 'Content-Length': buf.length.toString() },
    });
  } catch (err) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    throw BadRequest('Failed to fetch file');
  }
});
