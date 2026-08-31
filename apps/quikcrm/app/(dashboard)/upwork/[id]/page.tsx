import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth/require";
import { hasPermission } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import { db } from "@/lib/db";
import { getUpworkJob } from "@/lib/services/upwork/upwork-service";
import { upworkOwnerScope } from "@/lib/services/upwork/resolve-upwork-user";
import { ConvertToProspectButton } from "@/components/upwork/convert-to-prospect-button";
import { UpworkActivityTimeline } from "@/components/upwork/upwork-activity-timeline";
import {
  UPWORK_SOURCE_SYSTEM,
  upworkActivityExternalIdPrefix,
} from "@/lib/services/activities/upwork-activity-types";

/**
 * Upwork job detail — the full captured record.
 *
 * Read-only. Every value is the free text Upwork rendered at capture time, so
 * it is displayed verbatim rather than parsed or reformatted.
 *
 * A job the caller cannot see (owner-scoped) 404s rather than 403s, matching
 * the API: "not yours" and "does not exist" must be indistinguishable.
 */

interface DetailField {
  label: string;
  value: string | null;
}

function FieldGrid({ fields }: { fields: DetailField[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-xs uppercase tracking-wider text-crm-muted">{f.label}</dt>
          <dd className="mt-1 break-words text-sm text-crm-text">{f.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function UpworkJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  if (!(await hasPermission(user, "upwork", "view"))) redirect("/");

  const job = await getUpworkJob(user.orgId, id, upworkOwnerScope(user));
  if (!job) notFound();

  // A proposal exists if ANY proposal field was captured. Checking all four (not
  // just proposalId) means a partial capture — e.g. Upwork showed the Connects
  // but no id — still surfaces rather than hiding data the user saved.
  const hasProposal =
    job.proposalId !== null ||
    job.proposalSubmittedAt !== null ||
    job.connectsUsed !== null ||
    job.boostConnects !== null ||
    job.proposalCoverLetter !== null;

  // Has this job already been converted? Looked up ORG-WIDE (not owner-scoped):
  // a colleague's conversion still counts, and offering a second one would only
  // fail against the unique constraint.
  const convertedProspect = await db.crmProspect.findFirst({
    where: { orgId: user.orgId, upworkJobId: job.id },
    select: { id: true, name: true },
  });

  return (
    <PageContainer size="wide">
      <div className="mb-3">
        <Link
          href="/upwork"
          className="inline-flex items-center gap-1.5 text-sm text-crm-muted hover:text-crm-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Upwork
        </Link>
      </div>

      <PageHeader
        title={job.jobTitle}
        subtitle={
          job.deletedAt
            ? "This job is in Trash."
            : "Captured from Upwork by the QuikCRM browser extension."
        }
        actions={
          <>
            <ConvertToProspectButton
              job={{
                id: job.id,
                jobTitle: job.jobTitle,
                clientLocation: job.clientLocation,
                jobDescription: job.jobDescription,
              }}
              convertedProspect={convertedProspect}
            />
            {job.jobUrl ? (
              <a
                href={job.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
              >
                <ExternalLink className="h-4 w-4" />
                Open on Upwork
              </a>
            ) : null}
          </>
        }
      />

      <div className="space-y-4">
        <section className="rounded-lg border border-crm-border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-crm-text">Job details</h2>
          <FieldGrid
            fields={[
              { label: "Project Type", value: job.projectType },
              { label: "Project Price", value: job.projectPrice },
              { label: "Project Time", value: job.projectTime },
              { label: "Required Connects", value: job.requiredConnects },
              { label: "Proposals", value: job.proposals },
              { label: "Reviews", value: job.reviews },
              { label: "Client Location", value: job.clientLocation },
              { label: "Upwork Job ID", value: job.upworkJobId },
              {
                label: "Added",
                value: job.createdAt.toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              },
            ]}
          />
        </section>

        {job.skills && (
          <section className="rounded-lg border border-crm-border bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-crm-text">Skills</h2>
            <div className="flex flex-wrap gap-1.5">
              {job.skills
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((skill, i) => (
                  <span
                    key={`${skill}-${i}`}
                    className="rounded-full bg-accent-100 px-2.5 py-0.5 text-xs text-accent-700"
                  >
                    {skill}
                  </span>
                ))}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-crm-border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-crm-text">Description</h2>
          {job.jobDescription ? (
            // Scraped plain text: preserve the posting's own line breaks without
            // rendering it as HTML.
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-crm-text">
              {job.jobDescription}
            </p>
          ) : (
            <p className="text-sm text-crm-muted">No description captured.</p>
          )}
        </section>

        {/*
          Proposal — the freelancer's own submitted bid, captured by the
          extension's "Extract Proposal". Rendered only when a proposal exists:
          most captured jobs are saved for research and never bid on, so an
          empty Proposal card on every job would be noise.

          `connectsUsed` is the SUBMISSION cost (Upwork exposes no historical
          spend figure), kept distinct from the listing's "Required Connects"
          shown in Job details above.
        */}
        {hasProposal && (
          <section className="rounded-lg border border-crm-border bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-crm-text">Proposal</h2>
            <FieldGrid
              fields={[
                { label: "Proposal ID", value: job.proposalId },
                {
                  label: "Submitted",
                  value: job.proposalSubmittedAt
                    ? job.proposalSubmittedAt.toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : null,
                },
                // Numbers, not free text — String() so a real 0 renders as "0"
                // rather than being swallowed by FieldGrid's `|| "—"` fallback.
                {
                  label: "Connects Used",
                  value: job.connectsUsed === null ? null : String(job.connectsUsed),
                },
                {
                  label: "Boost Connects",
                  value: job.boostConnects === null ? null : String(job.boostConnects),
                },
              ]}
            />

            <div className="mt-4 border-t border-crm-border pt-4">
              <h3 className="mb-2 text-xs uppercase tracking-wider text-crm-muted">
                Cover Letter
              </h3>
              {job.proposalCoverLetter ? (
                // Same treatment as the job description: scraped plain text, so
                // whitespace-pre-wrap keeps the letter's paragraphs, blank lines
                // and bullet lines intact WITHOUT rendering it as HTML. Capped
                // height with overflow-y-auto so a long letter scrolls in place
                // instead of pushing the timeline off-screen — the text itself
                // is never truncated.
                <p className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-crm-text">
                  {job.proposalCoverLetter}
                </p>
              ) : (
                <p className="text-sm text-crm-muted">Cover letter not available</p>
              )}
            </div>
          </section>
        )}

        <UpworkActivityTimeline
          sourceSystem={UPWORK_SOURCE_SYSTEM}
          externalIdPrefix={upworkActivityExternalIdPrefix(job.id)}
        />

        {job.jobUrl && (
          <section className="rounded-lg border border-crm-border bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-crm-text">Source</h2>
            <a
              href={job.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm text-accent-700 hover:underline"
            >
              {job.jobUrl}
            </a>
          </section>
        )}
      </div>
    </PageContainer>
  );
}
