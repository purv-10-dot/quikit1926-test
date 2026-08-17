import { AppShell } from '@/components/AppShell';
import { ConsoleThemeProvider } from '@/components/super-admin/theme';
import { requirePageRoles } from '@/lib/auth/page-guard';

// Server-side role gate (F-001). Previously chrome-only: any authenticated user
// could load this group's pages. ADMIN passes everywhere by design.
//
// ConsoleThemeProvider sits INSIDE this gate on purpose — the accent it applies
// is the admin's own preference, and mounting it here is what confines it
// to this route group. Nothing under (tenant-admin) or the learner portals can
// see it. See components/super-admin/theme.tsx (directory name predates the
// ADMIN rename; left in place to avoid churn on unrelated imports).
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageRoles(['ADMIN']);
  return (
    <ConsoleThemeProvider>
      <AppShell role="ADMIN">{children}</AppShell>
    </ConsoleThemeProvider>
  );
}
