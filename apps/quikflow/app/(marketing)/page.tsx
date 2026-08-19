import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
import { authOptions } from "@/lib/auth";
import Nav from "./_components/Nav";
import Hero from "./_components/Hero";
import Features from "./_components/Features";
import FooterCTA from "./_components/FooterCTA";
import ScrollReveal from "./_components/ScrollReveal";

/**
 * Public landing page at `/`.
 *
 *   - Unauthenticated → render the landing page (200 OK)
 *   - Authenticated   → redirect to `/dashboard`
 *
 * Middleware lets `/` through (added to publicRoutes). The session check
 * here keeps logged-in users out of the marketing page — they expect the
 * app, not a brochure, when they hit the root. Mirrors
 * apps/quikscale/app/(marketing)/page.tsx.
 */
export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  // A user bounced here for lacking app access (?reason=no_app_access) must see
  // the landing page + popup even if they still hold a session — don't redirect
  // them straight to /dashboard (requireAppAccess would just bounce them back).
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user?.id && !deniedAccess) {
    redirect("/dashboard");
  }

  return (
    <main className="stage" id="main-content">
      <AppAccessDeniedPopup appName="QuikFlow" />
      <Nav />
      <Hero />
      <Features />
      <FooterCTA />
      <ScrollReveal />
    </main>
  );
}
