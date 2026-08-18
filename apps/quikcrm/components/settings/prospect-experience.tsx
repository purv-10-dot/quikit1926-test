"use client";

import {
  experienceRange,
  type LinkedInExperience,
} from "@/lib/services/prospects/linkedin-experience";

/**
 * Work experience captured by the LinkedIn extension, rendered for the
 * Prospects list. Shown alongside the company details in the prospect drawer.
 *
 * Presentational only: the blob is already normalized and URL-sanitised by
 * parseLinkedInExperiences on the server, so nothing here re-validates it.
 */
export function ProspectExperience({
  experiences,
}: {
  experiences: LinkedInExperience[];
}) {
  if (experiences.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
        Experience ({experiences.length}
        {experiences.length === 1 ? " position" : " positions"})
      </h4>

      <ol className="mt-2 space-y-3">
        {experiences.map((exp, i) => {
          const range = experienceRange(exp);
          // Duration and location share a line, matching the extension panel.
          const meta = [range, exp.location].filter(Boolean).join(" · ");

          return (
            <li
              key={`${exp.jobTitle}-${exp.companyName}-${i}`}
              className="rounded-md border-l-2 border-accent-500 bg-[var(--color-bg-secondary)] p-3"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {exp.jobTitle || "(no title)"}
                </span>
                {exp.current && (
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    Current
                  </span>
                )}
              </div>

              {exp.companyName && (
                <div className="mt-0.5 text-sm text-[var(--color-text-primary)]">
                  {exp.companyUrl ? (
                    <a
                      href={exp.companyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-600 hover:underline"
                    >
                      {exp.companyName}
                    </a>
                  ) : (
                    exp.companyName
                  )}
                </div>
              )}

              {meta && (
                <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                  {meta}
                </div>
              )}

              {exp.description && (
                // pre-line preserves the scraper's newline-joined bullet lines.
                <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  {exp.description}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
