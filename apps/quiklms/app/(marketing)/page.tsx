import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveLmsRole } from '@/lib/auth/resolve-role';
import { landingPathFor, resolveTenantType } from '@/lib/auth/landing';
import { FAQS } from './layout';
import Nav from './_components/Nav';
import Hero from './_components/Hero';
import Platform from './_components/Platform';
import Roles from './_components/Roles';
import Assessment from './_components/Assessment';
import Faq from './_components/Faq';
import FooterCTA from './_components/FooterCTA';

/**
 * Public landing page at `/`.
 *
 *   - Unauthenticated â†’ render the landing page (200 OK)
 *   - Authenticated   â†’ redirect to that role's dashboard
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
 * both resolve to `/` â€” the old one was deleted rather than left to collide.
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
  // back to the dashboard that just refused them â€” an infinite loop. Render the
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
  const loggedOut = reason === 'logged_out';

  if (session?.user?.id && !deniedAppAccess && !loggedOut) {
    const role = await resolveLmsRole(session.user);
    // A school tenant's admin belongs on /school-dashboard, not the corporate
    // one — see lib/auth/landing.ts.
    const tenantType = await resolveTenantType(session.user.orgId);
    redirect(landingPathFor(role, tenantType));
  }

  return (
    <div className="bg-[#0b1020]">
      {deniedAppAccess && (
        <div
          role="status"
          className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-100"
        >
          Your organisation does not currently have access to QuikSkill, or your
          access has been removed. Contact your administrator if you think this
          is a mistake.
        </div>
      )}
      {loggedOut && (
        <div
          role="status"
          className="border-b border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-center text-sm text-emerald-100"
        >
          You&apos;ve been signed out. Click{' '}
          <span className="font-semibold">Sign in</span> when you&apos;re ready
          to return.
        </div>
      )}
      <Nav />
      <main>
        <Hero />
        <Platform />
        <Roles />
        <Assessment />
        <Faq items={FAQS} />
      </main>
      <FooterCTA />
    </div>
  );
}
