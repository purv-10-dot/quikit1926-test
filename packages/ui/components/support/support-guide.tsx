"use client";

/**
 * User Guide view — scrollable getting-started content.
 *
 * Renders the structured `GuideSection[]` that `@quikit/shared/supportContent`
 * holds per app, so the copy lives with the data rather than being hard-coded
 * into thirteen near-identical components. Apps that need something bespoke can
 * pass their own sections (or arbitrary JSX) through `SupportLauncher`.
 */

import type { GuideSection } from "@quikit/shared/supportContent";

export function SupportGuide({ sections }: { sections: GuideSection[] }) {
  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-[var(--color-text-secondary)] space-y-4">
      {sections.map((section, i) => (
        <section key={i}>
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
            {section.heading}
          </h4>
          {section.body && <p>{section.body}</p>}
          {section.bullets && section.bullets.length > 0 && (
            <ul className="list-disc pl-5 space-y-1 mt-1">
              {section.bullets.map((bullet, j) => (
                <li key={j}>
                  <strong className="text-[var(--color-text-primary)]">{bullet.label}</strong>
                  {" — "}
                  {bullet.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
