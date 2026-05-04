/**
 * 5-step Application Wizard — Founder portal.
 *
 * Steps: Company → Funding → Financials → Documents → Review.
 * Step 4 (Documents) is informational; uploads happen on /documents after
 * submission completes (Vercel Blob; needs the dealId from the new record).
 */
import { Suspense } from "react";
import ApplicationWizard from "./application-wizard";
import { db } from "@/lib/db";
import { getDevAwareSession } from "@/lib/dev-session";


async function loadVerticals() {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  if (!orgId) return [];
  return db.vCVertical.findMany({
    where: { orgId, enabled: true },
    select: { slug: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
}

export default async function NewApplicationPage() {
  const verticals = await loadVerticals();
  return (
    <div className="px-4 py-5 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">New Application</h1>
        <p className="text-sm text-gray-500 mt-1">
          Fill out the 5 steps below. You can save and return — your draft is
          stored locally as you type.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-gray-400">Loading…</p>}>
        <ApplicationWizard verticals={verticals} />
      </Suspense>
    </div>
  );
}
