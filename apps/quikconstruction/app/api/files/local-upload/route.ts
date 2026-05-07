import { NextRequest, NextResponse } from "next/server";
import { getStorageDriver, LocalDriver } from "@/lib/storage";

/**
 * PUT /api/files/local-upload?token=<signed>
 *
 * Local-driver-only endpoint. The presigned upload URL issued by the local
 * driver routes here. We verify the HMAC token, then persist the request
 * body to <STORAGE_LOCAL_DIR>/<bucket>/<key>.
 *
 * When STORAGE_DRIVER=s3 or =r2, this route returns 404 because the client
 * uploads directly to object storage and never hits this path.
 *
 * The max body size Next.js accepts here is 4.5 MB by default, which is
 * why the local driver is a dev-only backend. For LAN deployments with
 * larger files, either (a) stream via a custom server, or (b) bump
 * `api.bodyParser.sizeLimit` in next.config.js and accept the cost.
 */
export async function PUT(req: NextRequest) {
  const driver = getStorageDriver();
  if (!(driver instanceof LocalDriver)) {
    return NextResponse.json(
      { error: "Local upload endpoint only active when STORAGE_DRIVER=local" },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const verified = driver.verifyToken(token, "put");
  if (!verified) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  // Stream the body into a buffer. The App Router gives us a ReadableStream —
  // using arrayBuffer() is fine for the local-driver use case since it's
  // dev-only and bounded by Next's body-parser limit.
  const body = Buffer.from(await req.arrayBuffer());

  // Content-Length sanity check
  if (verified.contentLength !== undefined && body.length !== verified.contentLength) {
    return NextResponse.json(
      { error: `Size mismatch: expected ${verified.contentLength}, got ${body.length}` },
      { status: 409 }
    );
  }

  await driver.acceptUpload(verified.key, body);
  return NextResponse.json({ ok: true, bytes: body.length });
}
