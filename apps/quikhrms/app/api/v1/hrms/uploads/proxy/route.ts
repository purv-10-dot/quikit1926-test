import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getS3Object } from "@/lib/s3";

// Keys are `uploads/<orgId>/<uuid>.<ext>` (see ../route.ts).
const KEY_PATTERN = /^uploads\/[a-zA-Z0-9_-]+\/[a-f0-9-]{8,}\.[a-zA-Z0-9]{2,8}$/;

/**
 * GET /api/v1/hrms/uploads/proxy?key=...
 *
 * Streams a stored S3 object back to the browser. Auth-guarded AND tenant-scoped:
 * the key's tenant segment must match the caller's tenant, so one tenant can
 * never fetch another tenant's files by guessing/leaking a key (was previously
 * an open, unauthenticated endpoint).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_FAILED", message: "key required" } }, { status: 400 });
  }
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ success: false, error: { code: "INVALID_KEY", message: "Invalid key format" } }, { status: 400 });
  }
  // Tenant isolation: `uploads/<orgId>/...` — only your own tenant's objects.
  if (key.split("/")[1] !== ctx.orgId) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Not allowed" } }, { status: 403 });
  }

  try {
    const obj = await getS3Object(key);
    return new NextResponse(new Uint8Array(obj.body), {
      status: 200,
      headers: {
        "Content-Type": obj.contentType,
        "Content-Length": String(obj.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("GET /uploads/proxy error:", err);
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Object not found" } }, { status: 404 });
  }
});
