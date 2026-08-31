"use client";

import type { LinkedInCompany } from "@/lib/services/prospects/linkedin-company";

/**
 * Company details captured by the LinkedIn extension, rendered for the
 * Prospects list. Shown in a drawer when the COMPANY cell is clicked.
 *
 * Presentational only: the blob is already normalized and URL-sanitised by
 * parseLinkedInCompany on the server, so nothing here re-validates it.
 */
export function ProspectCompany({ company }: { company: LinkedInCompany }) {
  const facts: Array<[string, string]> = [
    ["Industry", company.industry],
    ["Website", company.website],
    ["Headquarters", company.headquarters],
    ["Company size", company.companySize],
    ["Employees", company.employees],
    ["Founded", company.founded],
    ["Followers", company.followers],
    ["Specialties", company.specialties],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <div className="space-y-5">
      {/* Header: banner + logo + name/tagline */}
      <div>
        {company.banner && (
          // eslint-disable-next-line @next/next/no-img-element -- remote LinkedIn CDN URL, not a known-size local asset
          <img
            src={company.banner}
            alt=""
            className="h-24 w-full rounded-md object-cover"
          />
        )}
        <div className="mt-3 flex items-start gap-3">
          {company.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- remote LinkedIn CDN URL
            <img
              src={company.logo}
              alt={`${company.name} logo`}
              className="h-14 w-14 rounded-md border border-[var(--color-border)] object-contain bg-white"
            />
          )}
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              {company.name || "Company"}
            </h3>
            {company.tagline && (
              <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
                {company.tagline}
              </p>
            )}
            {company.companyUrl && (
              <a
                href={company.companyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-accent-600 hover:underline"
              >
                View on LinkedIn →
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Facts */}
      {facts.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                {label}
              </dt>
              <dd className="mt-0.5 break-words text-sm text-[var(--color-text-primary)]">
                {label === "Website" ? (
                  <a
                    href={/^https?:\/\//i.test(value) ? value : `https://${value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-600 hover:underline"
                  >
                    {value}
                  </a>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* About */}
      {company.about && (
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
            About
          </h4>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[var(--color-text-primary)]">
            {company.about}
          </p>
        </div>
      )}

      {/* Company posts */}
      {company.posts.length > 0 && (
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
            Recent company posts ({company.posts.length})
          </h4>
          <ul className="mt-2 space-y-3">
            {company.posts.map((post, i) => (
              <li
                key={post.postUrl || `${i}`}
                className="rounded-md border border-[var(--color-border)] p-3"
              >
                {post.text && (
                  <p className="whitespace-pre-line text-sm text-[var(--color-text-primary)]">
                    {post.text}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                  {post.date && <span>{formatDate(post.date)}</span>}
                  <span>{post.reactions} reactions</span>
                  <span>{post.comments} comments</span>
                  {post.images.length > 0 && <span>{post.images.length} image(s)</span>}
                  {post.videos.length > 0 && <span>{post.videos.length} video(s)</span>}
                  {post.postUrl && (
                    <a
                      href={post.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-600 hover:underline"
                    >
                      Open
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {company.source && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          Extracted via {company.source}
        </p>
      )}
    </div>
  );
}

/** Render an ISO date, falling back to the raw value if it will not parse. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
