import { LOGIN_HREF } from "./login-href";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="qa-gradient">
      <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <span className="inline-flex items-center rounded-full border border-[var(--qa-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--qa-primary)]">
          Asset lifecycle, end to end
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-6xl">
          Every company asset, accounted for.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-[var(--qa-muted)] sm:text-lg">
          QuikAsset tracks laptops, monitors, furniture and more from procurement
          to retirement — with assignments, repairs, depreciation, fiscal budgets
          and a full audit trail.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={LOGIN_HREF}
            className="qa-btn-primary inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold"
          >
            Open QuikAsset <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#features"
            className="inline-flex items-center rounded-lg border border-[var(--qa-border)] bg-white px-6 py-3 text-sm font-semibold text-[var(--qa-ink)] hover:bg-[var(--qa-bg-soft)]"
          >
            See what it does
          </a>
        </div>
      </div>
    </section>
  );
}
