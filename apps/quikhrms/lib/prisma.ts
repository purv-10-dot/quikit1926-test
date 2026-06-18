/**
 * Back-compat shim.
 *
 * HRMS code historically imported `prisma` from "@/lib/prisma". The canonical
 * client is now the shared `db` from @quikit/database (HRMS tables live in the
 * `app_quikhrms` schema). New code should import `{ db }` from "@/lib/db";
 * this alias keeps the existing call sites working.
 */
export { db as prisma } from "@quikit/database";
