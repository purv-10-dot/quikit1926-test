import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LandingClient from "./_components/landing-client";

/**
 * Public landing page at `/`.
 *
 *   - Unauthenticated → render the marketing landing (200 OK)
 *   - Authenticated   → redirect to `/dashboard`
 *
 * Middleware lets `/` through (publicRoutes). The session check here keeps
 * logged-in users out of the brochure — they expect the app at the root.
 * Mirrors the QuikScale / QuikTrack / QuikInfra marketing flow.
 */
export default async function MarketingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/dashboard");
  }
  return <LandingClient />;
}
