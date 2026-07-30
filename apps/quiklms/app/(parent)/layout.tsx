import { AppShell } from '@/components/AppShell';
import { requirePageRoles } from '@/lib/auth/page-guard';

// Server-side role gate (F-001). Previously chrome-only: any authenticated user
// could load this group's pages. SUPER_ADMIN passes everywhere by design.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageRoles(['PARENT']);
  return <AppShell role="PARENT">{children}</AppShell>;
}
