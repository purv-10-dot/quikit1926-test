"use client";

/**
 * "Convert to Prospect" action on the Upwork job detail page.
 *
 * Opens the SHARED prospect form (components/prospects/prospect-form.tsx) with
 * the Upwork fields that have a genuine Prospect counterpart pre-filled. It
 * does not create a prospect itself — the form owns creation via the shared
 * POST /api/prospects, which also records the reference back to this job.
 *
 * The Upwork record is never modified by any of this: the job keeps every one
 * of its own fields, and the link is a single `upworkJobId` column on the
 * prospect side.
 *
 * ── Field mapping ──────────────────────────────────────────────────────────
 * Only meanings that actually correspond are mapped. Deliberately NOT mapped:
 *   Skills, Proposals, Reviews, Project Price/Time, Required Connects
 *     — properties of a job posting, with no Prospect equivalent. Forcing them
 *       into unrelated fields would corrupt the prospect record; they stay on
 *       the Upwork job, one click away via the link on the prospect row.
 *   Name / Email — the client is anonymous on an Upwork posting. Left blank for
 *       the user to fill in, which the form requires for Name.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ProspectForm,
  type ProspectFormInitial,
} from "@/components/prospects/prospect-form";

export interface UpworkJobForConversion {
  id: string;
  jobTitle: string;
  clientLocation: string | null;
  jobDescription: string | null;
}

export function ConvertToProspectButton({
  job,
  convertedProspect,
}: {
  job: UpworkJobForConversion;
  /** Set when this job has already been converted — blocks a second conversion. */
  convertedProspect?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  // Already converted: show the outcome INSTEAD of the action — the two states
  // are mutually exclusive. Derived from the CrmProspect.upworkJobId relation
  // read server-side on every render, never from client state, so a reload or a
  // colleague's conversion is always reflected.
  //
  // The prospect name deep-links into the Prospects list with ?prospectId=,
  // which selects and scrolls to that row. There is no /prospects/[id] detail
  // route in this app — the Prospects module is a single list with drawers — so
  // this navigates to the specific prospect using what actually exists.
  if (convertedProspect) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-800">
        <CheckCircle2 size={15} aria-hidden className="shrink-0" />
        <span>Converted to Prospect:</span>
        <Link
          href={`/settings/prospects?prospectId=${encodeURIComponent(convertedProspect.id)}`}
          className="font-semibold text-green-900 underline underline-offset-2 hover:text-green-950"
        >
          {convertedProspect.name}
        </Link>
      </span>
    );
  }

  // Only genuine semantic matches — see the note above.
  const initial: ProspectFormInitial = {
    // Upwork Job Title → Prospect Title. Both describe the role/work, and it is
    // the mapping named in the requirement.
    title: job.jobTitle,
    // Client location → the prospect's location context. The posting exposes no
    // company name, so Company is intentionally left for the user.
    company: null,
    // The job description is the best available summary of the engagement.
    shortSummary: job.jobDescription
      ? job.jobDescription.slice(0, 2000)
      : null,
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <UserPlus size={15} aria-hidden />
        Convert to Prospect
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Convert Upwork job to Prospect"
        width="max-w-3xl"
      >
        {/* Show what is carried over and what the job keeps, so nothing is
            silently copied and the user knows the Upwork record is intact. */}
        <div className="mb-4 rounded-lg border border-crm-border bg-crm-panel/40 px-3 py-2 text-sm">
          <p className="text-crm-text">
            Pre-filled from{" "}
            <span className="font-medium">{job.jobTitle}</span>
            {job.clientLocation ? ` · ${job.clientLocation}` : ""}
          </p>
          <p className="mt-1 text-xs text-crm-muted">
            The Upwork job and all of its details stay unchanged. The new prospect
            will link back to it.
          </p>
        </div>

        <ProspectForm
          initial={initial}
          upworkJobId={job.id}
          submitLabel="Create prospect"
          onSaved={(prospect) => {
            setOpen(false);
            toast.success(`Prospect "${prospect.name}" created`);
            // Re-render the server component so the button flips to the
            // already-converted state without a manual reload.
            router.refresh();
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
