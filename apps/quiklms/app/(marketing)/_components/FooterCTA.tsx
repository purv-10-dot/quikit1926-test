import { ArrowRight, GraduationCap } from 'lucide-react';

export default function FooterCTA() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#0b1020]">
      <div className="mx-auto max-w-6xl px-5">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 px-8 py-14 text-center sm:px-14 sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-15"
            style={{
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M30 24v12M24 30h12\' stroke=\'%23fff\' stroke-width=\'1.5\'/%3E%3C/svg%3E")',
            }}
          />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready when you are
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-indigo-100">
              Sign in with your Quikit account. If your organisation already uses another Quikit app,
              you are one click away.
            </p>
            <a
              href="/login"
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50 active:scale-[0.98]"
            >
              Sign in to QuikSkill
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 py-10 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-lg bg-white/10">
              <GraduationCap className="size-3.5 text-white/80" />
            </span>
            <span className="font-display text-sm font-bold text-white/90">QuikSkill</span>
          </div>

          <div className="flex items-center gap-6 text-xs text-white/45">
            <a href="https://quikit.ai" className="transition-colors hover:text-white/70">
              Quikit
            </a>
            <a href="/verify-certificate" className="transition-colors hover:text-white/70">
              Verify a certificate
            </a>
            <span>© {year} Quikit</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
