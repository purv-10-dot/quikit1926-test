/**
 * Canonical shared Prisma client entry point — platform-standard `@/lib/db`
 * (mirrors apps/quiktrack, apps/quikcrm, apps/quikinfra and handbook §6.4).
 * Always import the client from "@/lib/db" in new code; the indirection is what
 * lets the test harness swap the client for a mock.
 *
 * LMS domain models are the `Lms`-prefixed models in the shared schema
 * (`app_quiklms`), accessed as `db.lmsUser`, `db.lmsTenant`, …; central identity
 * models (`db.user` = auth.User, `db.orgMember`, `db.userAppAccess`) live on the
 * SAME client.
 */
export { db } from "@quikit/database";
