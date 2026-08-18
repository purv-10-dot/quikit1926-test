// apps/quikcrmexpress/app/api/telephony/recording/route.ts
/**
 * Same-origin streaming proxy for IndiaVoice/RP Digital call recordings.
 *
 * Why this exists: the recording host (`recordsahm.rpdigitalphone.com`)
 * returns `Access-Control-Allow-Origin: <itself>` — a self-referencing CORS
 * header that allows only its own origin. Browsers can navigate to the URL
 * (Open in new tab works) but the HTML <audio> element fetches the file via
 * a CORS-checked request, which gets blocked. The audio control then shows
 * 0:00 and refuses to play.
 *
 * This route fetches the WAV server-side and streams it back to the browser
 * from the CRM's own origin — no CORS check applies to same-origin media.
 *
 * Security:
 *   - Auth-gated (requireApiUser) so recordings can't be hot-linked.
 *   - URL allow-list pinned to *.rpdigitalphone.com so this can't be turned
 *     into an arbitrary SSRF / HTTP relay.
 *   - Range header is forwarded so the audio control can seek.
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = [/\.rpdigitalphone\.com$/i];

function isAllowed(target: URL): boolean {
  return ALLOWED_HOSTS.some((re) => re.test(target.hostname));
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const raw = req.nextUrl.searchParams.get("url");
    if (!raw) return NextResponse.json({ success: false, error: "url query param required" }, { status: 400 });

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid url" }, { status: 400 });
    }
    if (target.protocol !== "https:" || !isAllowed(target)) {
      return NextResponse.json({ success: false, error: "Host not allowed" }, { status: 400 });
    }

    // Forward Range so seeking in the <audio> control sends partial requests.
    const upstreamHeaders: Record<string, string> = { Accept: "audio/*,*/*;q=0.1" };
    const range = req.headers.get("range");
    if (range) upstreamHeaders.Range = range;

    const upstream = await fetch(target.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      // The recordings live behind a public URL; no auth needed on the
      // upstream fetch itself.
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ success: false, error: `Upstream ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    // Pass through the bytes + the headers a media element needs. We
    // explicitly do NOT pass through the upstream's CORS header (we're
    // same-origin now, so it's irrelevant) or Set-Cookie (the upstream's
    // session cookies are not ours to relay).
    const out = new Headers();
    const contentType = upstream.headers.get("content-type") || "audio/wav";
    out.set("Content-Type", contentType);
    const len = upstream.headers.get("content-length");
    if (len) out.set("Content-Length", len);
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) out.set("Accept-Ranges", acceptRanges);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) out.set("Content-Range", contentRange);
    // Tell the browser it's safe to cache for a short while; recordings
    // are immutable once the call ends.
    out.set("Cache-Control", "private, max-age=3600");
    // When ?download=1, force a save-as instead of inline playback. Same-origin
    // so this reliably downloads (a cross-origin <a download> is ignored by the
    // browser and would just stream/open the file instead).
    if (req.nextUrl.searchParams.get("download") === "1") {
      const fileName = target.pathname.split("/").pop() || "recording.wav";
      out.set("Content-Disposition", `attachment; filename="${fileName}"`);
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: out,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
