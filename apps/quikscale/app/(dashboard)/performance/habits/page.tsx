"use client";

import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { AdminHabitsView } from "./components/AdminHabitsView";
import { MemberFillView } from "./components/MemberFillView";

/**
 * Rockefeller Habits — role router.
 *
 * Only **system admins** see the History panel + AggregateView + launch flow.
 * Everyone else (including users who happen to have a Habits:view extra grant)
 * sees only the one-page fill form. The split is hard-wired to the admin
 * role — per-user permission extras cannot grant dashboard access. This is
 * by design: granting "view" to a non-admin would otherwise leak aggregate
 * results across the org, which the brief explicitly forbids.
 */
export default function HabitsPage() {
  const perms = useMyPermissions();

  if (perms.loading) {
    return <div className="text-sm text-gray-400 text-center py-16">Loading…</div>;
  }

  if (perms.isAdmin) {
    return <AdminHabitsView />;
  }
  return <MemberFillView />;
}
