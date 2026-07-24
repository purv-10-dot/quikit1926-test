/**
 * QuikLMS now consumes the SHARED platform Prisma client (`@quikit/database`),
 * same as quikscale / quikcrm / quiktrack — no forked LMS client. LMS domain
 * models are the `Lms`-prefixed models in the shared schema (`app_quiklms`),
 * accessed as `prisma.lmsUser`, `prisma.lmsTenant`, … ; central identity models
 * (`prisma.user` = auth.User, `prisma.orgMember`, `prisma.userAppAccess`) live on
 * the SAME client. Exported as `prisma` so the existing call sites keep their
 * `import { prisma } from '@/lib/prisma'` unchanged.
 */
export { db as prisma } from '@quikit/database';
