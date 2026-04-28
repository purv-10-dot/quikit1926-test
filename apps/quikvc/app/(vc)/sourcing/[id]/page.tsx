/**
 * Sourced opportunity detail — thesis-fit + convert-to-deal.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import OpportunityActions from "./opportunity-actions";

export default async function SourcedOpportunityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) notFound();

  const [opp, verticals] = await Promise.all([
    db.vCSourcedOpportunity.findFirst({
      where: { id: params.id, tenantId },
      include: { vertical: { select: { id: true, name: true } } },
    }),
    db.vCVertical.findMany({
      where: { tenantId, enabled: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!opp) notFound();

  const askLakhs = opp.fundingAsk ? Number(opp.fundingAsk / BigInt(10_000_000)) : null;

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto space-y-5">
      <Link href="/sourcing" className="text-xs text-gray-500 hover:text-gray-900">
        ← Back to sourcing
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-gray-900">{opp.startupName}</h1>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span className="uppercase tracking-wider">{opp.source}</span>
          <span>·</span>
          <span>{opp.vertical?.name ?? "no vertical"}</span>
          <span>·</span>
          <span>{opp.status}</span>
        </div>
      </header>

      <section className="bg-white border border-gray-200 rounded-xl p-5 grid grid-cols-2 gap-4 text-sm">
        <Pair label="Contact name" value={opp.contactName ?? "—"} />
        <Pair label="Contact email" value={opp.contactEmail ?? "—"} />
        <Pair label="Phone" value={opp.contactPhone ?? "—"} />
        <Pair label="Website" value={opp.website ?? "—"} />
        <Pair label="Funding ask" value={askLakhs ? `₹${askLakhs.toLocaleString("en-IN")}L` : "—"} />
      </section>

      {opp.pitch && (
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Pitch</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{opp.pitch}</p>
        </section>
      )}

      {opp.thesisFitScore != null && (
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-wider text-gray-400">Thesis-fit score</p>
            <p className="text-3xl font-semibold tabular-nums text-gray-900">{opp.thesisFitScore}</p>
          </div>
          {opp.thesisFitReason && (
            <p className="text-sm text-gray-700 mt-2">{opp.thesisFitReason}</p>
          )}
        </section>
      )}

      <OpportunityActions
        oppId={opp.id}
        currentVerticalId={opp.verticalId}
        currentStatus={opp.status}
        verticals={verticals}
        canConvert={!!opp.contactEmail && !!opp.verticalId && opp.status !== "converted"}
        convertedApplicationId={opp.convertedApplicationId}
      />
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
