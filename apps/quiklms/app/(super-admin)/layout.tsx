import { AppShell } from '@/components/AppShell';
import { requirePageRoles } from '@/lib/auth/page-guard';

// Server-side role gate (F-001). Previously chrome-only: any authenticated user
// could load this group's pages. SUPER_ADMIN passes everywhere by design.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageRoles(['SUPER_ADMIN']);
  return <AppShell role="SUPER_ADMIN">{children}</AppShell>;
}
