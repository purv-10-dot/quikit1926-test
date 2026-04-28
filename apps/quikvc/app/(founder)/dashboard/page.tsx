/**
 * Founder Dashboard — current stage, progress, pending actions, timeline.
 *
 * Sprint 1 placeholder. Sprint 2 wires real application data + stage tracker.
 */
export default function FounderDashboardPage() {
  return (
    <div className="px-4 py-5 max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">Welcome</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track your application status and upload pending documents.
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-gray-400">
          Current stage
        </p>
        <p className="text-lg font-semibold text-gray-900 mt-1">
          Application not started
        </p>
        <button className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          Start application
        </button>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-900">Pending actions</p>
        <p className="text-xs text-gray-400 italic mt-3">
          You have no pending actions. Start your application to begin.
        </p>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-900">Activity timeline</p>
        <p className="text-xs text-gray-400 italic mt-3">No activity yet.</p>
      </section>
    </div>
  );
}
