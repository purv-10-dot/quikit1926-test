import { LocalDriver, localUploadSecret } from "@/lib/server/storage/local";
import { UPLOAD_TOKEN_HEADER, verifyToken, type UploadTokenPayload } from "@/lib/server/storage/tokens";

export const dynamic = "force-dynamic";

/**
 * PUT /api/uploads/local — the local analog of a signed upload URL. The HMAC
 * token IS the authorization (minted by POST /api/uploads/sign), carried in
 * the `X-Upload-Token` header rather than the URL path — an on-prem IIS
 * reverse proxy in front of this app rejects any single URL segment over
 * ~260 chars (http.sys `UrlSegmentMaxLength`), and this token alone runs ~450.
 */
export async function PUT(req: Request): Promise<Response> {
  const token = req.headers.get(UPLOAD_TOKEN_HEADER);
  const payload = token ? verifyToken<UploadTokenPayload>(token, localUploadSecret()) : null;
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
