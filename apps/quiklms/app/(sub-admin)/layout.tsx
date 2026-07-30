import { AppShell } from '@/components/AppShell';
import { requirePageRoles } from '@/lib/auth/page-guard';

// Server-side role gate (F-001). Previously chrome-only: any authenticated user
// could load this group's pages. SUPER_ADMIN passes everywhere by design.
//
// Render the shell for the role that ACTUALLY passed the gate rather than a
// hardcoded SUB_ADMIN: a SUB_ADMIN's own management links (e.g. Learners →
// /user-management) point at shared pages, and a SUPER_ADMIN or TENANT_ADMIN can
// reach these routes too — each should keep their own sidebar instead of being
// silently reskinned as a sub-admin. Mirrors the (tenant-admin) layout.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const role = await requirePageRoles(['TENANT_ADMIN', 'SUB_ADMIN']);
  return <AppShell role={role}>{children}</AppShell>;
}
