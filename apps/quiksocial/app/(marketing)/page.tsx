import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildLoginUrl } from "@quikit/shared/login-url";
import ScrollVideoBG from "./_components/ScrollVideoBG";
import ScrollScenes from "./_components/ScrollScenes";
import NextSection from "./_components/NextSection";
import ParallaxForeground from "./_components/ParallaxForeground";
import FeaturesScroll from "./_components/FeaturesScroll";
import Workflow from "./_components/Workflow";
import Stats from "./_components/Stats";
import Platforms from "./_components/Platforms";
import Testimonials from "./_components/Testimonials";
import FAQ from "./_components/FAQ";
import Footer from "./_components/Footer";
import ContactCTA from "./_components/ContactCTA";

/**
 * Public landing page at `/`.
 *
 *   - Unauthenticated → render the landing page (200 OK)
 *   - Authenticated   → redirect to `/dashboard`
 *
 * Middleware lets the exact root path through (see middleware.ts); the
 * session check here keeps logged-in users out of the marketing page — they
 * expect the app, not a brochure, when they hit the root.
 */
const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKSOCIAL_URL ?? "http://localhost:3007",
  postLoginPath: "/dashboard",
});

export default async function MarketingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <>
      <ScrollVideoBG src="/bg-scrub.mp4" scrubFactor={1} />

      {/* Top bar */}
      <header className="topbar">
        <a href="/" className="brand" aria-label="QuikSocial">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Quiksocial%20Logo%20Dark.png"
            alt="QuikSocial"
            className="brand-logo"
          />
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a href={LOGIN_HREF} className="topbar-cta">
            LOGIN
          </a>
          <ContactCTA />
        </div>
      </header>

      <main>
        <ScrollScenes />
        <NextSection />
        <ParallaxForeground />
        <Workflow />
        <FeaturesScroll />
        <Stats />
        <Platforms />
        <Testimonials />
        <FAQ />
        <Footer />
      </main>
    </>
  );
}
