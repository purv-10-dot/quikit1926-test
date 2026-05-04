import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { generateToken } from "@/lib/tokens";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      // Silent-success to prevent account enumeration
      return NextResponse.json({ success: true });
    }
    const user = await db.user.findUnique({ where: { email: parsed.data.email } });

    if (user) {
      const { token, hash } = generateToken();
      await db.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hash,
          type: "password_reset",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      try {
        await sendPasswordResetEmail({ to: user.email, token });
      } catch (err) {
        console.error("[forgot-password] email send failed:", err);
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    // Silent-success to prevent enumeration
    return NextResponse.json({ success: true });
  }
}
