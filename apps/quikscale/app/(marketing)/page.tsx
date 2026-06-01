import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Nav from "./_components/Nav";
import Hero from "./_components/Hero";
import ScrollReveal from "./_components/ScrollReveal";
import FourPillars from "./_components/FourPillars";
import Features from "./_components/Features";
import Outcomes from "./_components/Outcomes";
import Workflows from "./_components/Workflows";
import WhyQuikScale from "./_components/WhyQuikScale";
import Comparison from "./_components/Comparison";
import AIAgents from "./_components/AIAgents";
import ProductCards from "./_components/ProductCards";
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
export default async function MarketingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="stage" id="main-content">
      <Nav />
      <Hero />
      <ProductCards />
      <FourPillars />
      <Outcomes />
      <Features />
      <Workflows />
      <div className="compare-agents-band">
        <Comparison />
        <AIAgents />
      </div>
      <WhyQuikScale />
      <Testimonial />
      <WhoItsFor />
      <CoachModel />
      <FooterCTA />
      <ScrollReveal />
    </main>
  );
}
