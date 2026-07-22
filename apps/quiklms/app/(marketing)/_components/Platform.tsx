import { Layers, MonitorPlay, ClipboardCheck, Award, CalendarDays, BarChart3 } from 'lucide-react';

const FEATURES = [
  {
    icon: Layers,
    title: 'Structured authoring',
    body: 'Courses hold modules, modules hold sub-modules, sub-modules hold resources — drag to reorder at every level. Video, audio, PDF, Office documents, rich text, embeds and SCORM packages all sit side by side.',
  },
  {
    icon: MonitorPlay,
    title: 'A player that tracks',
    body: 'SCORM 1.2 and 2004 report completion and score straight back into the learner record. Sequential progression can lock the next lesson until the current one is genuinely done.',
  },
  {
    icon: ClipboardCheck,
    title: 'Assessment with teeth',
    body: 'Five question types, per-question scoring, question banks and attempt limits. Randomisation is pinned server-side per attempt, so the paper differs between two learners sitting together.',
  },
  {
    icon: Award,
    title: 'Certificates worth showing',
    body: 'Design the certificate on a real canvas, then issue it automatically on completion. Each one carries a QR code and a public verification page an employer can check without an account.',
  },
  {
    icon: CalendarDays,
    title: 'Batches and timetables',
    body: 'For schools: batches, scheduled classes, attendance, homework and parent visibility. For enterprises: course assignments, due dates and compliance windows.',
  },
  {
    icon: BarChart3,
    title: 'Reporting that answers questions',
    body: 'Progress by learner, batch, course and org. Compliance dashboards show who is overdue right now — not who was overdue when the last export ran.',
  },
];

export default function Platform() {
  return (
    <section id="platform" className="bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">The platform</p>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Everything between enrolment and evidence
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Most teams run an LMS for delivery, a separate tool for exams, and a spreadsheet for who
            has actually completed what. QuikSkill is the three of those as one system.
          </p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="group bg-white p-8 transition-colors hover:bg-slate-50">
                <span className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-display mt-5 text-lg font-bold text-slate-900">{f.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
