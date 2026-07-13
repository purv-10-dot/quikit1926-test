import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveLmsRole } from '@/lib/auth/resolve-role';

/**
 * Root route. Middleware guarantees a session before this renders; we resolve
 * the user's effective LMS role — preferring their LMS `User.role` row, falling
 * back to the coarse platform mapping (operator with no LMS row → SUPER_ADMIN)
 * — and redirect to that role's landing page. Using `resolveLmsRole` (the same
 * resolution `getAuthContext` uses) keeps the landing page in lock-step with
 * the API guards, so a roster TEACHER/PARENT/TENANT_ADMIN never lands on the
 * wrong dashboard. (Previously the qs_role cookie drove this in middleware.)
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

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const role = await resolveLmsRole(session.user);
  redirect(LANDING[role] ?? '/learner/dashboard');
}
