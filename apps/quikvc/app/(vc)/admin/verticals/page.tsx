/**
 * Admin — Verticals management.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import VerticalsClient from "./verticals-client";

export default async function VerticalsAdminPage() {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  if (!orgId) notFound();

  const verticals = await db.vCVertical.findMany({
    where: { orgId },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { scoringCriteria: true, deals: true } } },
  });

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto space-y-5">
      <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
        ← Admin
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Verticals</h1>
        <p className="text-sm text-gray-500 mt-1">
          Industry sectors. Each vertical has its own scoring criteria.
        </p>
      </header>

      <VerticalsClient
        initial={verticals.map((v) => ({
          id: v.id,
          slug: v.slug,
          name: v.name,
          description: v.description ?? "",
          enabled: v.enabled,
          sortOrder: v.sortOrder,
          dealCount: v._count.deals,
          criteriaCount: v._count.scoringCriteria,
        }))}
      />
    </div>
  );
}
