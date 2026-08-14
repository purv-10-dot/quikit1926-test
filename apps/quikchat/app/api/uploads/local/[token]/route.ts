import { LocalDriver, localUploadSecret } from "@/lib/server/storage/local";
import {
  verifyToken,
  type DownloadTokenPayload,
} from "@/lib/server/storage/tokens";

export const dynamic = "force-dynamic";

interface Ctx {
  params: { token: string };
}

/**
 * GET /api/uploads/local/{token} — short-lived download (token minted at
 * serialize time after the normal message-read auth). Streams with the right
 * Content-Type + Content-Disposition (inline for media, attachment for files).
 *
 * The token stays in the path here (unlike the PUT upload route, which moved
 * its token to a header — see UPLOAD_TOKEN_HEADER): this URL is consumed
 * directly by `<img>`/`<a>`/`<video>` src/href, which can't attach a custom
 * header. That leaves the same latent http.sys/IIS 260-char URL-segment risk
 * on this path if the token ever grows long enough — currently moot since UAT
 * runs the GCS driver (downloads there are direct storage.googleapis.com
 * signed URLs, never through this route), but worth knowing before this driver
 * is ever the one in front of that proxy.
 */
export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const payload = verifyToken<DownloadTokenPayload>(params.token, localUploadSecret());
  if (!payload || payload.kind !== "down") {
    return Response.json({ error: "Invalid or expired download token" }, { status: 401 });
  }
  let buf: Buffer;
  try {
    buf = await new LocalDriver().read(payload.objectPath);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const disposition = payload.downloadName
    ? `${payload.disposition}; filename="${payload.downloadName.replace(/"/g, "")}"`
    : payload.disposition;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": payload.contentType || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=600",
    },
  });
}
