/**
 * Investor Dashboard — capital summary + active deals.
 *
 * Sprint 1 placeholder. Sprint 4 wires real Investor + DealAllocation data.
 */
const SUMMARY = [
  { label: "Committed", value: "—" },
  { label: "Deployed", value: "—" },
  { label: "Available", value: "—" },
];

export default function InvestorDashboardPage() {
  return (
    <div className="px-6 py-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Your Portfolio</h1>
        <p className="text-sm text-gray-500 mt-1">
          Capital commitments, deployed allocations, and active deals.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SUMMARY.map((item) => (
          <div
            key={item.label}
            className="bg-white border border-gray-200 rounded-xl p-5"
          >
            <p className="text-xs uppercase tracking-wider text-gray-400">
              {item.label}
            </p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              {item.value}
            </p>
          </div>
        ))}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-900">Active deals</p>
        <p className="text-xs text-gray-400 italic mt-3">
          You have no allocations yet. The VC team will notify you when a deal is
          ready for capital allocation.
        </p>
      </section>
    </div>
  );
}
