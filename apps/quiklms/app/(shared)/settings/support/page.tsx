/**
 * Settings → Support Status.
 *
 * Lives in the `(shared)` route group alongside /profile and /messages: it is
 * role-agnostic, so learners, teachers, parents, managers and admins all reach
 * the same page and each sees only their OWN requests.
 *
 * The `(shared)` layout renders AppShell with the caller's resolved role, so
 * the page inherits whichever sidebar that person normally sees.
 */

import { SupportStatusTab } from '@quikit/ui/support';

export default function SupportStatusPage() {
  return <SupportStatusTab />;
}
