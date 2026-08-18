"use client";

import { RequirePerm } from "@/components/shell/require-perm";
import { TestStatusesView } from "./_components/test-statuses-view";

/**
 * Settings → QuikTest (statuses + case templates).
 *
 * The sidebar hides this entry from non-admins, but `RequirePerm adminOnly` is what
 * makes a direct URL hit safe — matching every other admin page under /settings. The
 * restore action is separately admin-gated server-side, since UI guards are not
 * authorisation.
 */
export default function TestStatusesSettingsPage() {
  return (
    <RequirePerm adminOnly>
      <TestStatusesView />
    </RequirePerm>
  );
}
