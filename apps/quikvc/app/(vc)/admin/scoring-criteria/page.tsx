/**
 * Admin — Scoring Criteria.
 *
 * Per-vertical criteria with weights. Sum of weights per vertical should = 100.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import ScoringCriteriaClient from "./scoring-client";

export default async function ScoringCriteriaAdminPage() {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  if (!orgId) notFound();

  const verticals = await db.vCVertical.findMany({
    where: { orgId, enabled: true },
    orderBy: { sortOrder: "asc" },
    include: {
      scoringCriteria: { orderBy: { sortOrder: "asc" } },
    },
  });

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto space-y-5">
      <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
        ← Admin
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Scoring criteria</h1>
        <p className="text-sm text-gray-500 mt-1">
          Weighted criteria used by Claude to score deals. Each vertical&apos;s
          weights should sum to 100%.
        </p>
      </header>

      <ScoringCriteriaClient
        verticals={verticals.map((v) => ({
          id: v.id,
          name: v.name,
          criteria: v.scoringCriteria.map((c) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
            description: c.description ?? "",
            weight: c.weight,
          })),
        }))}
      />
    </div>
  );
}
