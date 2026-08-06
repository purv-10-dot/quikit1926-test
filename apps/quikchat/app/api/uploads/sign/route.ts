import { assertMembership, HttpError, withOrgAuth } from "@/lib/auth-shims";
import { readJson } from "@/lib/server/helpers";
import { RATE } from "@/lib/server/rate-limits";
import { getStorage, isAllowedUpload, UPLOAD_MAX_BYTES } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/uploads/sign { channelId, filename, contentType, size }
 * → an UploadTarget from the active storage driver. The objectPath is built
 * from `ctx.orgId` (tenant-scoped); membership + allowlist + size enforced here.
 */
export const POST = withOrgAuth(
  async (req, ctx) => {
    const body = await readJson(req);
    const channelId = body.channelId;
    const filename = body.filename;
    const size = body.size;

    if (typeof channelId !== "string" || !channelId) throw new HttpError(400, "channelId required");
    if (typeof filename !== "string" || !filename) throw new HttpError(400, "filename required");
    // Empty string is a valid browser MIME (common for source/code files), so
    // require a string but not a non-empty one — the allowlist gate below (by
    // extension) decides admissibility, and we normalize to a concrete type.
    if (typeof body.contentType !== "string") {
      throw new HttpError(400, "contentType required");
    }
    if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
      throw new HttpError(400, "size required");
    }
    const contentType = body.contentType || "application/octet-stream";

    await assertMembership(ctx.orgId, channelId, ctx.userId);

    if (!isAllowedUpload(contentType, filename)) {
      throw new HttpError(415, "Unsupported file type");
    }
    if (size > UPLOAD_MAX_BYTES) {
      throw new HttpError(413, "File too large");
    }

    const target = await getStorage().createUploadTarget({
      orgId: ctx.orgId,
      channelId,
      userId: ctx.userId,
      filename,
      contentType,
      size,
    });
    return Response.json(target);
  },
  { rateLimit: RATE.uploadSign },
);
