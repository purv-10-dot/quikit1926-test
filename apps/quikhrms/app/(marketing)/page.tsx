import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
import { authOptions } from "@/lib/auth";

import { Nav } from "./_components/nav";
import { Hero } from "./_components/hero";
import { TrustMarquee } from "./_components/trust-marquee";
import { Stats } from "./_components/stats";
import { ModulesBento } from "./_components/modules-bento";
import { FeatureShowcase } from "./_components/feature-showcase";
import { Security } from "./_components/security";
import { Lifecycle } from "./_components/lifecycle";
import { EngagementWall } from "./_components/engagement-wall";
import { Testimonials } from "./_components/testimonials";
import { Pricing } from "./_components/pricing";
import { Faq } from "./_components/faq";
import { CtaBanner } from "./_components/cta-banner";
import { Footer } from "./_components/footer";
import { PageEffects } from "./_components/page-effects";

// Reads the session cookie per request — never statically render the gate.
export const dynamic = "force-dynamic";

/**
 * Public landing page at `/` (session gate).
 *
 * Logged-out visitors see the marketing page; authenticated users are
 * server-redirected to /hrms before any markup renders. Middleware lets `/`
 * through unauthenticated (exact-match short-circuit in middleware.ts) —
 * this gate is the only thing separating the two audiences.
 */
export default async function LandingPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  // A user bounced here for lacking app access must see the landing page +
  // popup even if they still hold a session (SessionGuard would re-bounce them).
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user && !deniedAccess) redirect("/dashboard");

  return (
    <>
      <AppAccessDeniedPopup appName="QuikHRMS" />
      <Nav />
      <main id="top">
        <Hero />
        <TrustMarquee />
        <Stats />
        <ModulesBento />
        <FeatureShowcase />
        <Security />
        <Lifecycle />
        <EngagementWall />
        <Testimonials />
        <Pricing />
        <Faq />
        <CtaBanner />
      </main>
      <Footer />
      <PageEffects />
    </>
  );
}
