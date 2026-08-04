import { GcsDriver } from "@/lib/server/storage/gcs";
import { uploadTokenSecret, verifyToken, type UploadTokenPayload } from "@/lib/server/storage/tokens";

export const dynamic = "force-dynamic";

interface Ctx {
  params: { token: string };
}

/**
 * PUT /api/uploads/gcs/{token} — the server-side receiver for GCS uploads. The
 * browser PUTs here (not to storage.googleapis.com), so no bucket CORS is
 * needed; the server pushes the bytes to GCS with the SA creds. The HMAC token
 * IS the authorization (minted by POST /api/uploads/sign). Exempt from the auth
 * middleware because its matcher skips the entire /api prefix — same as the
 * local upload route.
 *
 * NOTE: App Router route handlers have no bodyParser/sizeLimit, so up to
 * UPLOAD_MAX_BYTES (25 MB) is read here and capped by the token's maxBytes.
 * The one external limit is the host's request-body cap (e.g. Vercel serverless
 * ~4.5 MB) — reaching the full 25 MB depends on the deployment platform
 * allowing a body that large. This applies equally to the local upload route.
 */
export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  const payload = verifyToken<UploadTokenPayload>(params.token, uploadTokenSecret());
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
    await new GcsDriver().write(payload.objectPath, buf, payload.contentType);
  } catch {
    return Response.json({ error: "Write failed" }, { status: 400 });
  }
  return Response.json({ ok: true, objectPath: payload.objectPath });
}
