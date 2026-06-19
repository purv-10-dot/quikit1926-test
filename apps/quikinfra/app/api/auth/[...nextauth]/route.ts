import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * NextAuth route handler — the real config lives in `lib/auth.ts` so both this
 * handler and `getServerSession(authOptions)` callers share one source of truth.
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
