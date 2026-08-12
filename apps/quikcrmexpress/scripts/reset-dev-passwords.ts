/**
 * TEMPORARY — local development only.
 *
 * Resets `auth.User.password` (bcrypt) for a fixed allowlist of emails.
 * Does not touch OrgMember or any other tables.
 *
 *   npm run reset:passwords
 *
 * Requires DATABASE_URL (and a generated Prisma client). Do not run in production.
 */
import { db } from "../lib/db";
import { hashPassword } from "../lib/auth/bcrypt";

const NEW_PASSWORD = "admin123";

/** Lowercase emails — matches credentials login normalization in `lib/auth.ts`. */
const TARGET_EMAILS = [
  "adarsh.jain@quikit.ai",
  "rishab.dedora@moreyeahsa.com",
  "alok.emossy@emossy.com",
] as const;

async function main() {
  const hash = await hashPassword(NEW_PASSWORD);

  for (const email of TARGET_EMAILS) {
    const user = await db.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true, email: true },
    });

    if (!user) {
      console.warn(`[reset:passwords] No user found for email (case-insensitive): ${email}`);
      continue;
    }

    await db.user.update({
      where: { id: user.id },
      data: { password: hash },
    });

    console.log(
      `[reset:passwords] Updated password for id=${user.id} email=${user.email ?? email}`,
    );
  }

  console.log("[reset:passwords] Done.");
}

main().catch((error: unknown) => {
  console.error("[reset:passwords] Failed:", error);
  process.exit(1);
});
