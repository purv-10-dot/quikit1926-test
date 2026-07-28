import { NextResponse } from 'next/server';
import { route, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertSafeFetchUrl } from '@/lib/ssrf';

/** Legacy `timeout: 30000` (`learner.controller.ts:352`). */
const TIMEOUT_MS = 30_000;
/** Legacy `maxContentLength: 100 * 1024 * 1024` (`learner.controller.ts:353`). */
const MAX_BYTES = 100 * 1024 * 1024;

/**
 * GET /api/learner/file-proxy?url= — proxy a remote HTTP(S) file (e.g. PDF).
 *
 * Two classes of fix here (GAP_REPORT §2.4 / §3.2 learner):
 *
 * 1. RESTORED — the migration dropped both of the legacy's DoS bounds. axios had
 *    `timeout: 30000` and `maxContentLength: 100MB`; the port used a bare
 *    `fetch()` with neither, so a tarpit host could pin a serverless invocation
 *    indefinitely and a large file was a trivial OOM. Both are back.
 *
 * 2. HARDENED (deliberate, beyond parity — approved 2026-07-17) — the legacy had
 *    NO host restriction, so any authenticated user could reach
 *    `169.254.169.254` (cloud metadata), `localhost` or any RFC1918 host and get
 *    the body back. `assertSafeFetchUrl` blocks those on the RESOLVED IP.
 *
 * The size cap is enforced by STREAMING and aborting once it is passed —
 * `arrayBuffer()` would have to buffer the entire hostile payload first, which is
 * the very thing the cap exists to prevent. A lying `Content-Length` cannot
 * bypass it, because the running byte count is what is checked.
 */
export const GET = route(async (req) => {
  await requireAuth(req);
  const url = new URL(req.url).searchParams.get('url');
  if (!url) throw BadRequest('URL parameter is required');

  const decoded = decodeURIComponent(url);
  const safe = await assertSafeFetchUrl(decoded);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(safe.toString(), {
      signal: controller.signal,
      // Do not let a redirect escape the SSRF check: `manual` surfaces a 3xx
      // as-is instead of silently following it to an internal host.
      redirect: 'manual',
    });
    if (!upstream.ok || !upstream.body) throw BadRequest('Failed to fetch file');

    // Reject on the declared length first — cheap, when it is honest.
    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) throw BadRequest('Failed to fetch file');

    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > MAX_BYTES) {
          await reader.cancel();
          throw BadRequest('Failed to fetch file');
        }
        chunks.push(value);
      }
    }

    const buf = Buffer.concat(chunks);
    const contentType = upstream.headers.get('content-type') || 'application/pdf';
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'Content-Length': buf.length.toString(),
      },
    });
  } catch (err) {
    // Legacy collapsed every failure into this one 400 — the timeout included.
    if (err instanceof Error && 'statusCode' in err) throw err;
    throw BadRequest('Failed to fetch file');
  } finally {
    clearTimeout(timer);
  }
});
