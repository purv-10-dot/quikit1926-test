"use client";

import { RequirePerm } from "@/components/shell/require-perm";
import {
  SUPPORTED_FIELDS,
  CUSTOM_FIELD_ROW,
  UNSUPPORTED_FIELD_ROWS,
  OPERATORS,
  KEYWORDS,
  FUNCTIONS,
} from "./tql-help-meta";
import { TqlExamplesSection } from "./tql-examples-section";

const th = "text-left text-xs font-semibold uppercase tracking-wide text-gray-500 px-3 py-2 border-b border-gray-200";
const td = "text-sm text-gray-700 px-3 py-2 border-b border-gray-100 align-top";
const code = "font-mono text-xs bg-gray-100 rounded px-1.5 py-0.5";

/**
 * Settings → TQL Documentation — reached from the sidebar (SettingsShell's
 * NAV) and from the "Syntax help" button next to the admin-only TQL query
 * bar (see tql-editor.tsx). Living under /settings/* instead of /filters/*
 * means it renders inside SettingsShell (its own narrow settings nav) rather
 * than the full app DashboardShell — no top-level sidebar/nav clutter around
 * a reference page.
 *
 * The sidebar hides this entry from non-admins, but `RequirePerm adminOnly`
 * is what makes a direct URL hit safe — matching every other admin page
 * under /settings.
 *
 * Field support is imported from lib/tql/fields.ts, the translator's own
 * source of truth — this page cannot claim support the engine doesn't have.
 */
export default function TqlHelpSettingsPage() {
  return (
    <RequirePerm adminOnly>
      <div className="px-6 py-6 max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900">TQL syntax reference</h1>
        <p className="mt-2 text-sm text-gray-600 max-w-2xl">
          TQL (Tracker Query Language) is QuikTrack&rsquo;s advanced search — a JQL-style query language for the
          admin-only <code className={code}>TQL</code> mode of Filters. It&rsquo;s a deliberate subset: every field
          and function below is backed by real QuikTrack data, and every unsupported field is listed with the
          reason it isn&rsquo;t, rather than silently doing the wrong thing.
        </p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Anatomy of a query</h2>
          <p className="mt-2 text-sm text-gray-700">
            A query is one or more <code className={code}>field operator value</code> clauses joined by{" "}
            <code className={code}>AND</code> / <code className={code}>OR</code>, optionally followed by{" "}
            <code className={code}>ORDER BY</code>:
          </p>
          <pre className="mt-2 rounded bg-gray-900 text-gray-100 text-xs p-3 overflow-x-auto">
{`status != "Done" AND assignee = currentUser() ORDER BY updated DESC`}
          </pre>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Supported fields</h2>
          <div className="mt-2 overflow-x-auto rounded border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Field</th>
                  <th className={th}>Operators</th>
                  <th className={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORTED_FIELDS.map((row) => (
                  <tr key={row.field}>
                    <td className={td}><code className={code}>{row.field}</code></td>
                    <td className={td}>{row.operators}</td>
                    <td className={td}>{row.notes}</td>
                  </tr>
                ))}
                <tr>
                  <td className={td}><code className={code}>{CUSTOM_FIELD_ROW.field}</code></td>
                  <td className={td}>{CUSTOM_FIELD_ROW.operators}</td>
                  <td className={td}>{CUSTOM_FIELD_ROW.notes}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Not supported</h2>
          <p className="mt-2 text-sm text-gray-600">
            These appear in Jira&rsquo;s JQL grammar but have no QuikTrack equivalent yet. Using one returns a
            clear error rather than a wrong result.
          </p>
          <div className="mt-2 overflow-x-auto rounded border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Field</th>
                  <th className={th}>Why</th>
                </tr>
              </thead>
              <tbody>
                {UNSUPPORTED_FIELD_ROWS.map((row) => (
                  <tr key={row.field}>
                    <td className={td}><code className={code}>{row.field}</code></td>
                    <td className={td}>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Operators</h2>
          <div className="mt-2 overflow-x-auto rounded border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Operator</th>
                  <th className={th}>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {OPERATORS.map((row) => (
                  <tr key={row.op}>
                    <td className={td}><code className={code}>{row.op}</code></td>
                    <td className={td}>{row.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Keywords</h2>
          <div className="mt-2 overflow-x-auto rounded border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Keyword</th>
                  <th className={th}>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {KEYWORDS.map((row) => (
                  <tr key={row.keyword}>
                    <td className={td}><code className={code}>{row.keyword}</code></td>
                    <td className={td}>{row.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Functions</h2>
          <div className="mt-2 overflow-x-auto rounded border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Function</th>
                  <th className={th}>Returns</th>
                </tr>
              </thead>
              <tbody>
                {FUNCTIONS.map((row) => (
                  <tr key={row.fn}>
                    <td className={td}><code className={code}>{row.fn}</code></td>
                    <td className={td}>{row.returns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <TqlExamplesSection />
      </div>
    </RequirePerm>
  );
}
