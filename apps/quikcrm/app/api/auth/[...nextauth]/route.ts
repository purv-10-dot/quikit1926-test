import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * NextAuth route — uses the local authOptions which delegates to
 * createOAuthClientOptions from @quikit/auth (the platform IdP model).
 *
 * Don't customize here. Cross-app changes go in @quikit/auth.
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
