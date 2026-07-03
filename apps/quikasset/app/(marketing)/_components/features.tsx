import {
  Package,
  ArrowLeftRight,
  Wrench,
  BarChart2,
  Wallet,
  ShieldCheck,
} from "lucide-react";

const FEATURES = [
  { icon: Package, title: "Asset Inventory", body: "CRUD, bulk CSV/XLSX import, category taxonomy and live status tracking." },
  { icon: ArrowLeftRight, title: "Assignments", body: "Assign assets to employees, track condition and expected return, mark returns." },
  { icon: Wrench, title: "Repair & Recovery", body: "Send to vendor, track cost & status, manage loaner replacements, recover or retire." },
  { icon: Wallet, title: "Fiscal Budgets", body: "Per-FY quarterly budgets with actuals computed from purchases and repair spend." },
  { icon: BarChart2, title: "Reports", body: "Portfolio value, TCO, department costs, utilization and budget-vs-actual." },
  { icon: ShieldCheck, title: "Audit Trail", body: "Immutable log of every create, update, delete and state change across modules." },
];

const LIFECYCLE = ["Procure", "Catalogue", "Assign", "Repair / Replace", "Return", "Retire"];

export function Features() {
  return (
    <>
      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Everything an IT & ops team needs
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-[var(--qa-border)] bg-white p-6 shadow-sm"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--qa-bg-soft)] text-[var(--qa-primary)]">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-[var(--qa-muted)]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="lifecycle" className="bg-[var(--qa-bg-soft)]">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">The asset lifecycle</h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {LIFECYCLE.map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <span className="rounded-full border border-[var(--qa-border)] bg-white px-4 py-2 text-sm font-semibold">
                  {step}
                </span>
                {i < LIFECYCLE.length - 1 && (
                  <span className="text-[var(--qa-muted)]">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
