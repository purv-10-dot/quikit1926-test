import { NextRequest, NextResponse } from "next/server";
import { getStorageDriver, LocalDriver } from "@/lib/storage";

/**
 * GET /api/files/local-download?token=<signed>&fn=<filename>
 *
 * Local-driver-only endpoint. Verifies the HMAC token, reads the file from
 * disk, streams it back with a sensible Content-Disposition header.
 *
 * Returns 404 when STORAGE_DRIVER is s3 or r2.
 */
export async function GET(req: NextRequest) {
  const driver = getStorageDriver();
  if (!(driver instanceof LocalDriver)) {
    return NextResponse.json(
      { error: "Local download endpoint only active when STORAGE_DRIVER=local" },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const fileName = searchParams.get("fn") ?? "download.bin";
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const verified = driver.verifyToken(token, "get");
  if (!verified) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  try {
    const buf = await driver.readObject(verified.key);
    // Copy into a fresh ArrayBuffer so the DOM lib's BlobPart type is
    // satisfied — Node's Buffer.buffer is typed as ArrayBufferLike which
    // includes SharedArrayBuffer, and TS 5.7 rejects that assignment.
    const ab = new ArrayBuffer(buf.length);
    new Uint8Array(ab).set(buf);
    const blob = new Blob([ab], { type: "application/octet-stream" });
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Length": String(buf.length),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }
}
