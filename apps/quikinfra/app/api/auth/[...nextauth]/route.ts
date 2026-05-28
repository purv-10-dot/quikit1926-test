import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/next-auth-options";

/**
 * NextAuth route handler — the real config lives in
 * `src/lib/auth/next-auth-options.ts` so both this handler and
 * `getServerSession(authOptions)` callers share one source of truth.
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
