import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveLmsRole } from '@/lib/auth/resolve-role';
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
const LANDING: Record<string, string> = {
  SUPER_ADMIN: '/dashboard',
  TENANT_ADMIN: '/tenant-dashboard',
  SUB_ADMIN: '/sub-admin-dashboard',
  MANAGER: '/manager-dashboard',
  TEACHER: '/teacher-dashboard',
  PARENT: '/parent-dashboard',
  LEARNER: '/learner/dashboard',
};

export default async function LandingPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    const role = await resolveLmsRole(session.user);
    redirect(LANDING[role] ?? '/learner/dashboard');
  }

  return (
    <div className="bg-[#0b1020]">
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
