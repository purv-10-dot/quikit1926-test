import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
import { authOptions } from "@/lib/auth";
import Nav from "./_components/Nav";
import Hero from "./_components/Hero";
import ScrollReveal from "./_components/ScrollReveal";
import FourPillars from "./_components/FourPillars";
import Outcomes from "./_components/Outcomes";
import Workflows from "./_components/Workflows";
import WhyQuikScale from "./_components/WhyQuikScale";
import Comparison from "./_components/Comparison";
import WhoItsFor from "./_components/WhoItsFor";
import Testimonial from "./_components/Testimonial";
import CoachModel from "./_components/CoachModel";
import FooterCTA from "./_components/FooterCTA";

/**
 * Public landing page at `/`.
 *
 *   - Unauthenticated → render the landing page (200 OK)
 *   - Authenticated   → redirect to `/dashboard`
 *
 * Middleware lets `/` through (added to publicRoutes). The session check
 * here keeps logged-in users out of the marketing page — they expect the
 * app, not a brochure, when they hit the root.
 */
export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  // See QuikScale marketing page: a user bounced here for lacking app access
  // must see the landing page + popup even if they still hold a session.
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user?.id && !deniedAccess) {
    redirect("/dashboard");
  }

  return (
    <main className="stage" id="main-content">
      <AppAccessDeniedPopup appName="QuikTrack" />
      <Nav />
      <Hero />
      <Outcomes />
      <FourPillars />
      <Workflows />
      <Comparison />
      <WhyQuikScale />
      <Testimonial />
      <WhoItsFor />
      <CoachModel />
      <FooterCTA />
      <ScrollReveal />
    </main>
  );
}
