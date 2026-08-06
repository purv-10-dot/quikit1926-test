/**
 * Settings → Support Status.
 *
 * Deliberately OUTSIDE the three portal route groups. `(vc)`, `(founder)` and
 * `(investor)` each gate on `portalForRole(...)` and redirect anyone who
 * doesn't belong, so a page inside any one of them would be unreachable for the
 * other two — and all three kinds of user raise support requests. Two groups
 * can't resolve the same URL either, so one shared, ungated route it is.
 *
 * `requireSession` still applies: authenticated users only, and each sees only
 * their own requests (the API scopes by session org + user).
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SupportStatusTab } from "@quikit/ui/support";
import { requireSession } from "@/lib/require-session";
import { getVCRole } from "@/lib/rbac";
import { homePathForPortal, portalForRole } from "@/lib/roles";

export default async function SupportStatusPage() {
  const { userId, orgId } = await requireSession();

  // Send "Back" to whichever portal this person actually lives in, rather than
  // a hardcoded path that would bounce two thirds of users through a redirect.
  const role = await getVCRole(userId, orgId);
  const homePath = homePathForPortal(portalForRole(role ?? undefined));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <Link
          href={homePath}
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to QuikVC
        </Link>
        <p className="text-xs uppercase tracking-wider text-gray-400">QuikVC</p>
        <p className="text-sm font-semibold text-gray-900">Settings</p>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <SupportStatusTab />
      </main>
    </div>
  );
}
