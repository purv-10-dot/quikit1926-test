import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
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
export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  // A user bounced here for lacking app access must see the landing page +
  // popup even if they still hold a session (SessionGuard would re-bounce them).
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user?.id && !deniedAccess) {
    redirect("/dashboard");
  }
  return (
    <>
      <AppAccessDeniedPopup appName="QuikCRM" />
      <LandingClient />
    </>
  );
}
