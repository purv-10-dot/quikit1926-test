import { LocalDriver, localUploadSecret } from "@/lib/server/storage/local";
import {
  verifyToken,
  type DownloadTokenPayload,
  type UploadTokenPayload,
} from "@/lib/server/storage/tokens";

export const dynamic = "force-dynamic";

interface Ctx {
  params: { token: string };
}

/**
 * PUT /api/uploads/local/{token} — the local analog of a signed upload URL.
 * The HMAC token IS the authorization (minted by POST /api/uploads/sign).
 */
export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  const payload = verifyToken<UploadTokenPayload>(params.token, localUploadSecret());
  if (!payload || payload.kind !== "up") {
    return Response.json({ error: "Invalid or expired upload token" }, { status: 401 });
  }
  const ct = (req.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (ct !== payload.contentType) {
    return Response.json({ error: "Content-Type mismatch" }, { status: 400 });
  }
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength > payload.maxBytes) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }
  try {
    await new LocalDriver().write(payload.objectPath, buf);
  } catch {
    return Response.json({ error: "Write failed" }, { status: 400 });
  }
  return Response.json({ ok: true, objectPath: payload.objectPath });
}

/**
 * GET /api/uploads/local/{token} — short-lived download (token minted at
 * serialize time after the normal message-read auth). Streams with the right
 * Content-Type + Content-Disposition (inline for media, attachment for files).
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
