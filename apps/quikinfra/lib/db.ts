// Eagerly validate env on first import of the DB client — runs the Zod schema
// so a missing/illegal DATABASE_URL etc. fails fast with a clear message in
// production (logs a warning and continues in dev/test). This boot hook used
// to live in the now-removed local client (src/lib/db/prisma.ts); it stays here
// because every server module that touches the DB imports `@/lib/db`.
import "@/lib/config/env";

// QuikInfra runs on the shared central Prisma client. The central schema's
// `app_quikinfra` models mirror the real tables 1:1 (see migration notes).
export { db } from "@quikit/database";
