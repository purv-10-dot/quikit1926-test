import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
import { authOptions } from "@/lib/auth";
import { Nav } from "./_components/nav";
import { Hero } from "./_components/hero";
import { Features } from "./_components/features";
import { FooterCTA } from "./_components/footer-cta";

/**
 * Public marketing landing at `/`. Logged-in users are server-redirected to
 * the dashboard so they never see the brochure. The session gate is the only
 * coupling between this page and the app (reads quikasset's own authOptions).
 *
 * Exception: a signed-in user bounced here by `requireAppAccess` for lacking
 * QuikAsset access (`?reason=no_app_access`) must see the landing + the
 * access-denied popup — NOT be redirected back to /dashboard (which would
 * loop). Mirrors quiktrack's marketing page.
 */
export const dynamic = "force-dynamic";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user?.id && !deniedAccess) redirect("/dashboard");

  return (
    <main>
      <AppAccessDeniedPopup appName="QuikAsset" />
      <Nav />
      <Hero />
      <Features />
      <FooterCTA />
    </main>
  );
}
