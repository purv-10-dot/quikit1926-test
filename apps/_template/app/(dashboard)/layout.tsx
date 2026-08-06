/**
 * Dashboard layout — wraps every authenticated route in your app.
 *
 * The route group `(dashboard)` does not appear in the URL — it's purely an
 * organizational wrapper. Auth is enforced by middleware.ts at the edge; if
 * code reaches here, the user has a valid session.
 *
 * Common additions to make here (uncomment + import when needed):
 *   - <Sidebar /> from your own components (or copy quikscale's pattern).
 *   - <Header /> with logout, theme switch, tenant info.
 *   - <Toaster /> for toast notifications.
 *
 * <SupportLauncher> is mounted below and is NOT optional — every QuikIT app
 * ships Contact Support. Set `appSlug` to your app's registry slug; the guide
 * and assistant knowledge base are looked up from that slug in
 * `packages/shared/lib/supportContent.ts`. Add an entry there for your app
 * (a missing one falls back to generic copy, so this works on day one).
 * It pairs with `app/api/support/tickets/` — keep both.
 */

import { SupportLauncher } from "@quikit/ui/support";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <main>{children}</main>

      {/* Floating support launcher — outside any scroll container so it stays
          pinned to the viewport on every route. */}
      <SupportLauncher appSlug="__template" />
    </div>
  );
}
