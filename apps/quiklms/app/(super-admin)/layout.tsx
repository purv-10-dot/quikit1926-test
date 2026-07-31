import { AppShell } from '@/components/AppShell';
import { ConsoleThemeProvider } from '@/components/super-admin/theme';
import { requirePageRoles } from '@/lib/auth/page-guard';

// Server-side role gate (F-001). Previously chrome-only: any authenticated user
// could load this group's pages. SUPER_ADMIN passes everywhere by design.
//
// ConsoleThemeProvider sits INSIDE this gate on purpose — the accent it applies
// is the super-admin's own preference, and mounting it here is what confines it
// to this route group. Nothing under (tenant-admin) or the learner portals can
// see it. See components/super-admin/theme.tsx.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageRoles(['SUPER_ADMIN']);
  return (
    <ConsoleThemeProvider>
      <AppShell role="SUPER_ADMIN">{children}</AppShell>
    </ConsoleThemeProvider>
  );
}
