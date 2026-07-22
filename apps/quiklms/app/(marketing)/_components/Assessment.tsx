import { Shuffle, Eye, FileCheck2, QrCode } from 'lucide-react';

const POINTS = [
  {
    icon: Shuffle,
    title: 'Randomised per attempt',
    body: 'The served subset and its order are decided when the attempt starts and pinned server-side, so a refresh shows the same paper — and the person beside you does not.',
  },
  {
    icon: Eye,
    title: 'Proctoring that reports',
    body: 'Fullscreen enforcement, tab-switch and copy-paste detection, and webcam face checks. Every incident is logged against the session for an administrator to review.',
  },
  {
    icon: FileCheck2,
    title: 'Scored on the server',
    body: 'Answers are graded against the exact question set the learner was shown, never a re-derived one. Attempt limits are enforced where they are defined.',
  },
  {
    icon: QrCode,
    title: 'Verifiable on the outside',
    body: 'Certificates carry a QR code to a public verification page, and only become downloadable once the learner has genuinely met the passing criteria.',
  },
];

export default function Assessment() {
  return (
    <section id="assessment" className="relative overflow-hidden bg-[#0b1020] py-24 sm:py-28">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute right-1/4 top-0 size-[28rem] rounded-full bg-violet-600/15 blur-[110px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400">Assessment</p>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            A result that means something
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/60">
            A completion tick is easy to produce and easy to doubt. These are the parts that make a
            score defensible when someone asks.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {POINTS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur transition-colors hover:bg-white/[0.07]"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-display mt-5 text-lg font-bold text-white">{p.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-white/60">{p.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
