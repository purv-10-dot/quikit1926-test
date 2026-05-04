import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

const Body = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }

    const hash = hashToken(parsed.data.token);
    const row = await db.verificationToken.findFirst({
      where: { tokenHash: hash, type: "password_reset", usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row) {
      return NextResponse.json({ success: false, error: "Invalid or expired reset link." }, { status: 400 });
    }

    const hashed = await bcrypt.hash(parsed.data.password, 10);
    await db.$transaction([
      db.user.update({ where: { id: row.userId }, data: { password: hashed } }),
      db.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Reset failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
