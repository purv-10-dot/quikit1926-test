/**
 * Re-exports the shared Prisma client. Always import from "@/lib/db" inside
 * this app — never directly from "@quikit/database" in route/component code
 * (the indirection lets tests swap the client).
 */
export { db } from "@quikit/database";
