import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * NextAuth route. Uses the app's local `authOptions` (which resolves to the
 * QuikIT OAuth client when QUIKIT_URL is set, else the dev credentials
 * fallback). Cross-app auth changes go in @quikit/auth, not here.
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
