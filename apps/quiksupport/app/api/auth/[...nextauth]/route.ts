import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * NextAuth route — uses the app's shared authOptions (OIDC client to the
 * QuikIT launcher in SSO mode, credentials fallback for standalone dev).
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
