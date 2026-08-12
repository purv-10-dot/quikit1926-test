import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";

/** Server-side session read for RSC / route handlers. */
export async function getAppSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}
