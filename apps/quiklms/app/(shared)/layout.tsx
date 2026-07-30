import { AppShell } from '@/components/AppShell';
import { resolveActivePageRole } from '@/lib/auth/page-guard';

// Auth-only by design (multi-role group) — but the shell still needs to know
// WHICH role's navigation to render. This used to render `<AdaptiveShell>`, which
// guessed from `localStorage.qs_role` and defaulted to LEARNER, so a tenant admin
// or a just-switched sub-admin got the learner sidebar on /profile and /messages.
// `resolveActivePageRole` answers it from the session, honouring the role switcher
// (lib/auth/active-role.ts) exactly as the seven role-gated groups do.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const role = await resolveActivePageRole();
  return <AppShell role={role}>{children}</AppShell>;
}
