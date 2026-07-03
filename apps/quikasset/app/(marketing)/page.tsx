import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Nav } from "./_components/nav";
import { Hero } from "./_components/hero";
import { Features } from "./_components/features";
import { FooterCTA } from "./_components/footer-cta";

/**
 * Public marketing landing at `/`. Logged-in users are server-redirected to
 * the dashboard so they never see the brochure. The session gate is the only
 * coupling between this page and the app (reads quikasset's own authOptions).
 */
export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) redirect("/dashboard");

  return (
    <main>
      <Nav />
      <Hero />
      <Features />
      <FooterCTA />
    </main>
  );
}
