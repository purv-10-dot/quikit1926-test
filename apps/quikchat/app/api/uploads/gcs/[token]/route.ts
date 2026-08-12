import { GcsDriver } from "@/lib/server/storage/gcs";
import { uploadTokenSecret, verifyToken, type UploadTokenPayload } from "@/lib/server/storage/tokens";
import { logger } from "@/lib/shared/logger";

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
  } catch (err: unknown) {
    // Explicit fields ONLY — never the whole `err`. A GaxiosError (what
    // @google-cloud/storage throws for any HTTP-level failure) carries own
    // enumerable `config.headers.authorization` (a live OAuth token) and
    // `config.body` (these uploaded bytes); pino's error serializer copies every
    // own enumerable property, and the logger's redact paths are rooted at the log
    // object so they never reach inside `err`. name/message/code/status are what
    // actually separate a bad key (ERR_OSSL_UNSUPPORTED) from a missing permission
    // (403) from a wrong bucket (404) from a network blip (ENOTFOUND) — which is
    // all this log line exists to tell us. Deliberately no `stack`: errName +
    // errCode already says whether it came from bucket() construction or save().
    const g = err as { code?: unknown; status?: unknown } | null | undefined;
    logger.error(
      {
        errName: err instanceof Error ? err.name : typeof err,
        errMessage: err instanceof Error ? err.message : "unknown error",
        errCode: typeof g?.code === "string" || typeof g?.code === "number" ? g.code : undefined,
        errStatus: typeof g?.status === "number" ? g.status : undefined,
        objectPath: payload.objectPath,
        orgId: payload.orgId,
        userId: payload.userId,
      },
      "GCS upload write failed",
    );
    return Response.json({ error: "Write failed" }, { status: 400 });
  }
  return Response.json({ ok: true, objectPath: payload.objectPath });
}
