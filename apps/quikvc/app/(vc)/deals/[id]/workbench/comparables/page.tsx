/**
 * Comparable Companies tab — manual add (3a) + Claude-suggested (3b).
 */
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import ComparableAddButton from "./comparable-add-button";
import ComparableSuggestButton from "./comparable-suggest-button";

export default async function ComparablesPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  if (!orgId) notFound();

  const comps = await db.vCComparableCompany.findMany({
    where: { orgId, dealId: params.id },
    orderBy: [{ pinnedAsBenchmark: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, name: true, sector: true, source: true, reason: true,
      link: true, pinnedAsBenchmark: true,
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Comparable Companies</h2>
          <p className="text-sm text-gray-500 mt-1">
            Benchmark companies cited in the IC memo. Add manually or ask
            Claude for suggestions based on the deal&apos;s sector + description.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ComparableSuggestButton dealId={params.id} />
          <ComparableAddButton dealId={params.id} />
        </div>
      </header>

      {comps.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">No comparables added yet.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {comps.map((c) => (
            <li key={c.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                  {c.sector && <p className="text-xs text-gray-500 mt-0.5">{c.sector}</p>}
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-200">
                  {c.source}
                </span>
              </div>
              {c.reason && (
                <p className="text-xs text-gray-700 mt-2">{c.reason}</p>
              )}
              {c.link && (
                <a
                  href={c.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                >
                  Open ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
