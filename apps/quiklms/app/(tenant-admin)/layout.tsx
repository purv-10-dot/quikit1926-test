import { AppShell } from '@/components/AppShell';
import { requirePageRoles } from '@/lib/auth/page-guard';

// Server-side role gate (F-001). Previously chrome-only: any authenticated user
// could load this group's pages. SUPER_ADMIN passes everywhere by design.
//
// Render the shell for the role that ACTUALLY passed the gate — not a hardcoded
// TENANT_ADMIN. Two pages the super-admin sidebar links to (Users →
// /user-management, Question Bank → /question-bank) physically live in this
// route group; with the role hardcoded, a SUPER_ADMIN who clicked them was
// dropped into the tenant-admin shell, which — having no tenant type — falls
// back to the SCHOOL sidebar (Dashboard → /school-dashboard). That is the
// "clicking Users sends me to the school dashboard" bug. Passing the resolved
// role keeps a super-admin in the super-admin chrome and a sub-admin in theirs.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const role = await requirePageRoles(['TENANT_ADMIN', 'SUB_ADMIN']);
  return <AppShell role={role}>{children}</AppShell>;
}
