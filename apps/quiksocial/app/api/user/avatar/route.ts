/**
 * POST /api/user/avatar
 *
 * Upload profile picture to Cloudinary, persist URL on auth.User.avatar.
 *
 * Ported to QuikIT (Phase 3, Batch 5).
 */

import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;

export const POST = withOrgAuth(async ({ userId }, req: NextRequest) => {
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { success: false, error: "No file provided" },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { success: false, error: "File type not allowed" },
      { status: 400 },
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { success: false, error: "File too large (max 5 MB)" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let url: string;
  try {
    url = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "quiksocial/avatars",
          public_id: `user_${userId}`,
          overwrite: true,
          resource_type: "image",
          transformation: [
            { width: 256, height: 256, crop: "fill", gravity: "face" },
          ],
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error("Upload failed"));
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });
  } catch (err) {
    console.error("[user/avatar POST]", err);
    return NextResponse.json(
      { success: false, error: "Upload failed" },
      { status: 500 },
    );
  }

  await db.user.update({
    where: { id: userId },
    data: { avatar: url },
  });

  return NextResponse.json({ success: true, data: { url } });
});
