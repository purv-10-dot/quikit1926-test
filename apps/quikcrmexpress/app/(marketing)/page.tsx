import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
import { authOptions } from "@/lib/auth";
import Nav from "./_components/Nav";
import Hero from "./_components/Hero";
import Features from "./_components/Features";
import Faq from "./_components/Faq";
import FooterCTA from "./_components/FooterCTA";
import ScrollReveal from "./_components/ScrollReveal";

/**
 * Public landing page at `/`.
 *
 *   - Unauthenticated        → render the landing page (200 OK)
 *   - Authenticated          → redirect to /dashboard
 *   - ?reason=no_app_access  → render the landing page + denial popup, even
 *                              while holding a valid session
 *
 * Middleware lets "/" through via publicRoutes; the session check here is what
 * keeps signed-in users out of the brochure — they expect the app when they
 * hit the root. The no_app_access branch exists because a user bounced here
 * for lacking QuikCRMExpress access still has a session, and redirecting them
 * to /dashboard would put them in a loop.
 *
 * Mirrors apps/quiktrack/app/(marketing)/page.tsx and quikscale's equivalent.
 */
export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user?.id && !deniedAccess) {
    redirect("/dashboard");
  }

  return (
    <main className="stage" id="main-content">
      <AppAccessDeniedPopup appName="QuikCRMExpress" />
      <Nav />
      <Hero />
      <Features />
      <Faq />
      <FooterCTA />
      <ScrollReveal />
    </main>
  );
}
