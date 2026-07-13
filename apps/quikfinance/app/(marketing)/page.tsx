import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Nav from "./_components/Nav";
import Hero from "./_components/Hero";
import Outcomes from "./_components/Outcomes";
import Workflows from "./_components/Workflows";
import FooterCTA from "./_components/FooterCTA";
import ScrollReveal from "./_components/ScrollReveal";

/**
 * Public landing page at `/`.
 *   - Unauthenticated → render the marketing landing (200 OK)
 *   - Authenticated   → redirect to `/dashboard`
 * Middleware allows `/` through (publicRoutes); this session check keeps
 * signed-in users on the app, not the brochure.
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
      <Workflows />
      <FooterCTA />
      <ScrollReveal />
    </main>
  );
}
