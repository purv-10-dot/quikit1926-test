import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { AppAccessDeniedPopup } from '@quikit/ui/app-access-denied-popup';
import { authOptions } from '@/lib/auth';
import { resolveLmsRole } from '@/lib/auth/resolve-role';
import { landingPathFor, resolveTenantType } from '@/lib/auth/landing';
import { FAQS } from './faqs';
import Nav from './_components/Nav';
import Hero from './_components/Hero';
import TrustMarquee from './_components/TrustMarquee';
import Stats from './_components/Stats';
import Platform from './_components/Platform';
import Roles from './_components/Roles';
import Assessment from './_components/Assessment';
import Lifecycle from './_components/Lifecycle';
import Faq from './_components/Faq';
import FooterCTA from './_components/FooterCTA';
import Footer from './_components/Footer';
import PageEffects from './_components/PageEffects';

/**
 * Public landing page at `/`.
 *
 *   - Unauthenticated → render the landing page (200 OK)
 *   - Authenticated   → redirect to that role's dashboard
 *
 * This REPLACES the old `app/page.tsx`, which assumed middleware had already
 * guaranteed a session and so redirected everyone to `/login`. `/` is now in
 * `publicRoutes`, which is what lets a signed-out visitor (or the post-logout
 * redirect) actually see this page instead of bouncing into SSO.
 *
 * The role resolution is carried over verbatim: `resolveLmsRole` is the same
 * resolution `getAuthContext` uses, so the landing target stays in lock-step
 * with the API guards and a roster TEACHER/PARENT never lands on the wrong
 * dashboard.
 *
 * A route group adds no path segment, so this file and `app/page.tsx` would
 * both resolve to `/` — the old one was deleted rather than left to collide.
 */

export default async function LandingPage({
  searchParams,
}: {
  searchParams?: { reason?: string | string[] };
}) {
  const session = await getServerSession(authOptions);

  const rawReason = searchParams?.reason;
  const reason = Array.isArray(rawReason) ? rawReason[0] : rawReason;
  // Bounced here by the central entitlement gate (lib/auth/page-guard). This
  // visitor IS authenticated, so the redirect below would send them straight
  // back to the dashboard that just refused them — an infinite loop. Render the
  // landing page with an explanation instead.
  const deniedAppAccess = reason === 'no_app_access';

  // Arrived from the sign-out chain (lib/global-signout.ts). The local session
  // cookie clear and the three SLO cookie-clearing hops race the browser
  // landing back here, so a just-signed-out user's session can still be
  // momentarily readable. WITHOUT this guard the block below would treat them
  // as logged in and bounce them to their dashboard → middleware sees the
  // central session is already gone → quikit-auth. That is exactly the "QuikLMS
  // page flashes for a second then jumps to the login" bug. Hold on the landing
  // instead; the user clicks Sign in when they choose to.
  //
  // The client half of that same bug lives in lib/api.ts + app/providers.tsx:
  // `/` is exempt from the 401 → /login hard nav, and the providers only fetch
  // once a session exists. Both halves are needed — this guard alone still let
  // the page bounce about a second after it rendered.
  const loggedOut = reason === 'logged_out';

  if (session?.user?.id && !deniedAppAccess && !loggedOut) {
    const role = await resolveLmsRole(session.user);
    // A school tenant's admin belongs on /school-dashboard, not the corporate
    // one — see lib/auth/landing.ts.
    const tenantType = await resolveTenantType(session.user.orgId);
    redirect(landingPathFor(role, tenantType));
  }

  // The logged-out notice is a fixed bar that shifts the nav/hero down via
  // `has-notice`. The denied-access case is now a modal overlay
  // (AppAccessDeniedPopup), so it must NOT reserve the bar's height.
  const notice = loggedOut;

  return (
    // `has-notice` reserves --lp-notice-h so the fixed nav and the hero shift
    // down instead of sitting underneath the notice bar.
    <div className={`lp-root${notice ? ' has-notice' : ''}`}>
      {/* Signed in but not entitled to this app: bounced here with
          ?reason=no_app_access by lib/auth/page-guard. Same shared modal the
          other QuikIT apps use — it self-gates on the URL marker client-side. */}
      {deniedAppAccess && <AppAccessDeniedPopup appName="QuikLMS" />}
      {loggedOut && (
        <div role="status" className="lp-notice lp-notice-ok">
          <span>
            You&apos;ve been signed out. Click <b>Sign in</b> when you&apos;re ready to return.
          </span>
        </div>
      )}

      <Nav />
      <main>
        <Hero />
        <TrustMarquee />
        <Stats />
        <Platform />
        <Roles />
        <Assessment />
        <Lifecycle />
        <Faq items={FAQS} />
        <FooterCTA />
      </main>
      <Footer />
      <PageEffects />
    </div>
  );
}
