/**
 * Settings → Support Status, for the QuikIT launcher.
 *
 * The launcher is where someone lands when an app won't let them in, so it is
 * often where they raise a request — and therefore where they come back to
 * check on it. Each user sees only their own requests.
 *
 * NOT to be confused with `/support-tickets` in the (super-admin) group: that
 * is the cross-org triage queue for the QuikIT team, gated by
 * `withSuperAdminAuth`. This one is the ordinary per-user view every app has.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SupportStatusTab } from "@quikit/ui/support";

export default function SupportStatusPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <Link
          href="/apps"
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to apps
        </Link>
        <p className="text-xs uppercase tracking-wider text-gray-400">QuikIT</p>
        <p className="text-sm font-semibold text-gray-900">Settings</p>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <SupportStatusTab />
      </main>
    </div>
  );
}
