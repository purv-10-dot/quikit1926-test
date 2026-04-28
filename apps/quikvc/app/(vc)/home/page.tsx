/**
 * VC Home / Command Center.
 *
 * Sprint 1: shows the smart KPI strip + skeleton cards. Sprint 3 wires real
 * data + AI daily summary. See architecture brief §10 for sprint plan.
 */
const SIGNAL_CARDS = [
  { label: "Active deals", value: "—", delta: "Sprint 2", tone: "neutral" },
  { label: "Avg AI score", value: "—", delta: "Sprint 3", tone: "neutral" },
  { label: "IC due 48h", value: "—", delta: "Sprint 4", tone: "neutral" },
  { label: "Capital deployed", value: "—", delta: "Sprint 4", tone: "neutral" },
];

export default function VCHomePage() {
  return (
    <div className="px-6 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Command Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          What needs your attention right now.
        </p>
      </header>

      {/* Smart KPI strip */}
      <section
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        aria-label="Key performance indicators"
      >
        {SIGNAL_CARDS.map((card) => (
          <div
            key={card.label}
            className="bg-white border border-gray-200 rounded-xl p-4"
          >
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              {card.value}
            </p>
            <p className="text-xs text-gray-400 mt-1">{card.delta}</p>
          </div>
        ))}
      </section>

      {/* Two-column: actionable queue + secondary panels */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900">Actionable queue</h2>
          <p className="text-xs text-gray-500 mt-1">
            Prioritised list of deals needing analyst action.
          </p>
          <div className="mt-4 text-sm text-gray-400 italic">
            No deals yet — seed data lands in Sprint 1 finalisation.
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900">
              Upcoming meetings
            </h2>
            <p className="text-xs text-gray-400 italic mt-3">Sprint 3</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900">AI daily brief</h2>
            <p className="text-xs text-gray-400 italic mt-3">Sprint 3 — Claude</p>
          </div>
        </div>
      </section>

      <div className="text-xs text-gray-400 italic">
        Sprint 1 foundation. The 5 sprint plan and what each screen does live in{" "}
        <code className="font-mono">_internal/architecture-notes/quikvc-architecture-v1.md</code>.
      </div>
    </div>
  );
}
