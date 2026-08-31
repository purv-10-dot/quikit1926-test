import { EXAMPLE_CATEGORIES } from "./tql-help-meta";

/** The "Examples" section of the TQL Documentation page, split out because
 *  ~50 worked examples across 11 categories would push page.tsx well past
 *  the 300-line component ceiling. */
export function TqlExamplesSection() {
  return (
    <section className="mt-8 mb-10">
      <h2 className="text-lg font-semibold text-gray-900">Examples</h2>
      <p className="mt-2 text-sm text-gray-600">
        Grouped from single-clause basics up to composite real-world queries. The last group is deliberately
        invalid, to show what a rejected query looks like rather than only the happy path.
      </p>

      <div className="mt-4 space-y-6">
        {EXAMPLE_CATEGORIES.map((cat) => (
          <div key={cat.category}>
            <h3 className="text-sm font-semibold text-gray-800">{cat.category}</h3>
            <ul className="mt-2 space-y-2">
              {cat.examples.map((ex) => (
                <li key={ex.query} className="rounded border border-gray-200 p-2.5">
                  <pre className="text-xs font-mono bg-gray-50 rounded p-2 overflow-x-auto">{ex.query}</pre>
                  <p className="mt-1.5 text-xs text-gray-600">{ex.description}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
