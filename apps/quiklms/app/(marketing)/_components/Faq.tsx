export default function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section id="faq" className="bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-3xl px-5">
        <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Questions people actually ask
        </h2>

        <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
          {items.map((f) => (
            // <details> keeps this readable with JS disabled and needs no client
            // component — the whole page stays server-rendered.
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                <span className="text-base font-semibold text-slate-900">{f.q}</span>
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-slate-300 text-slate-500 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 pr-10 text-sm leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
