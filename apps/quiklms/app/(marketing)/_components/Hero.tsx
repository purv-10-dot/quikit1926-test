import { ArrowRight, ShieldCheck, Award, MonitorPlay } from 'lucide-react';

const PROOF = [
  { icon: MonitorPlay, label: 'SCORM 1.2 & 2004' },
  { icon: ShieldCheck, label: 'Proctored assessments' },
  { icon: Award, label: 'Verifiable certificates' },
];

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-[#0b1020] pb-24 pt-32 sm:pb-32 sm:pt-40">
      {/* Ambient light — pure decoration, kept out of the a11y tree. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10rem] size-[38rem] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-[120px]" />
        <div className="absolute bottom-[-14rem] right-[-8rem] size-[30rem] rounded-full bg-violet-600/20 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.07) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 70% 55% at 50% 35%, black 40%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 35%, black 40%, transparent 100%)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-4xl px-5 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/75 backdrop-blur">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
          Multi-tenant · schools and enterprises
        </span>

        <h1 className="font-display mt-7 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl">
          Training that actually
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            {' '}
            proves itself
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
          Author the course, deliver it, assess it under proctoring, and hand out a certificate an
          employer can verify — without stitching four tools together.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/login"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-[#0b1020] transition hover:bg-white/90 active:scale-[0.98] sm:w-auto"
          >
            Sign in
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="#platform"
            className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-7 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/10 sm:w-auto"
          >
            See what it does
          </a>
        </div>

        <ul className="mx-auto mt-12 flex max-w-2xl flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {PROOF.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.label} className="flex items-center gap-2 text-sm text-white/55">
                <Icon className="size-4 text-indigo-400" />
                {p.label}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
