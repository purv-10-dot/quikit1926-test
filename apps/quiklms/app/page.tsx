import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';

/**
 * Root route. Middleware guarantees a session before this renders; we map the
 * platform role to the LMS role and redirect to that role's landing page.
 * (Previously the qs_role cookie drove this in middleware.)
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

  const role = mapPlatformRoleToLmsRole(session.user.membershipRole, session.user.isSuperAdmin);
  redirect(LANDING[role] ?? '/learner/dashboard');
}
