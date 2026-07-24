/**
 * Platform ORG identity client. After the fold, this is simply the SHARED
 * `@quikit/database` client — the same one `@/lib/prisma` exports. The central
 * identity models (`orgDb.user` = auth.User, `orgDb.orgMember`,
 * `orgDb.userAppAccess`, `orgDb.app`, `orgDb.org`) and the LMS domain models
 * (`orgDb.lmsUser`, …) live on ONE client against the one `quikit_dev` database.
 *
 * Kept as a named `orgDb` export so identity-service.ts and other callers stay
 * unchanged. The previous forked `.prisma/client` bridge is retired.
 */
export { db as orgDb } from '@quikit/database';

/** Always available now that the LMS consumes the shared client directly. */
export const ORG_DB_ENABLED = true;
