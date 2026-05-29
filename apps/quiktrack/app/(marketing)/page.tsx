import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Nav from "./_components/Nav";
import Hero from "./_components/Hero";
import Outcomes from "./_components/Outcomes";
import FourPillars from "./_components/FourPillars";
import Workflows from "./_components/Workflows";
import Comparison from "./_components/Comparison";
import WhyQuikScale from "./_components/WhyQuikScale";
import Testimonial from "./_components/Testimonial";
import WhoItsFor from "./_components/WhoItsFor";
import CoachModel from "./_components/CoachModel";
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
 * app, not a brochure, when they hit the root.
 */
export default async function MarketingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="stage" id="main-content">
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
