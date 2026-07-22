const ROLES = [
  {
    name: 'Learners',
    body: 'A clear queue of what is assigned and what is due, a player that remembers where they stopped, and certificates they can share.',
    points: ['Resume where you left off', 'Attempt history and scores', 'Shareable certificates'],
  },
  {
    name: 'Teachers',
    body: 'Batches, attendance, homework and tutoring requests in one place — plus availability and payout summaries.',
    points: ['Batch rosters and schedules', 'Homework and grading', 'Availability and payouts'],
  },
  {
    name: 'Administrators',
    body: 'Author or approve content, assign it, and see compliance across the whole organisation without exporting anything.',
    points: ['Course and quiz authoring', 'Approval workflow', 'Compliance and analytics'],
  },
  {
    name: 'Parents',
    body: 'For schools: visibility of a child’s schedule, homework status, live classes and results — without a separate portal.',
    points: ['Schedule and attendance', 'Homework status', 'Progress and results'],
  },
];

export default function Roles() {
  return (
    <section id="roles" className="bg-slate-50 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Who it’s for</p>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            One platform, four very different jobs
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Each role gets its own surface. Nobody is handed an admin console and asked to find the
            three things that concern them.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div
              key={r.name}
              className="rounded-3xl border border-slate-200 bg-white p-8 transition-shadow hover:shadow-lg hover:shadow-slate-200/60"
            >
              <h3 className="font-display text-xl font-bold text-slate-900">{r.name}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{r.body}</p>
              <ul className="mt-5 space-y-2">
                {r.points.map((p) => (
                  <li key={p} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <span className="size-1.5 shrink-0 rounded-full bg-indigo-500" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
