import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Centralized NextAuth handler (OAuth client to the QuikIT IdP). Do not
// customize here — cross-app auth behavior lives in @quikit/auth.
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
