"use client";

/**
 * Client shell for the dedicated "Log activity" route.
 *
 * Replaces the old <LogActivityModal>. Reads the record context from the URL
 * search params so any trigger can deep-link into the composer with a record
 * pre-linked, mirroring the modal's `initialRelated` / `initialLead` props:
 *
 *   /activities/log
 *   /activities/log?relatedKind=Lead&relatedObjectId=<id>&label=<name>
 *   /activities/log?relatedKind=Lead&relatedObjectId=<id>&label=<name>
 *                  &source=<s>&stage=<st>&ownerName=<o>   (rich lead context)
 *   /activities/log?draftId=<id>                          (resume a saved draft)
 *
 * Drafts live in localStorage (device-local), so `draftId` is resolved here on
 * the client, not on the server.
 */

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LogActivityForm,
  type LeadContext,
} from "@/components/activities/log-activity-form";
import { listDraftEntries, type NamedDraft } from "@/lib/activities/activity-drafts";

const KIND_OPTIONS = ["None", "Lead", "Opportunity", "Contact", "Account"] as const;
type Kind = (typeof KIND_OPTIONS)[number];

function isKind(v: string | null): v is Kind {
  return !!v && (KIND_OPTIONS as readonly string[]).includes(v);
}

export function LogActivityPage({ canViewLeads }: { canViewLeads: boolean }) {
  const router = useRouter();
  const params = useSearchParams();

  const kindParam = params.get("relatedKind");
  const relatedObjectId = params.get("relatedObjectId");
  const label = params.get("label");
  const source = params.get("source");
  const stage = params.get("stage");
  const ownerName = params.get("ownerName");
  const draftId = params.get("draftId");

  // Rebuild the modal's `initialRelated` from the URL when a record kind + id +
  // label are present (any lookup kind). Standalone / no context → null.
  const initialRelated = useMemo(() => {
    if (isKind(kindParam) && kindParam !== "None" && relatedObjectId && label) {
      return { kind: kindParam, id: relatedObjectId, label };
    }
    return null;
  }, [kindParam, relatedObjectId, label]);

  // Rich lead context (source/stage/owner badges) — only meaningful for Lead.
  const initialLead = useMemo<LeadContext | null>(() => {
    if (kindParam === "Lead" && relatedObjectId && label) {
      return {
        id: relatedObjectId,
        label,
        source: source ?? undefined,
        stage: stage ?? undefined,
        ownerName: ownerName ?? undefined,
      };
    }
    return null;
  }, [kindParam, relatedObjectId, label, source, stage, ownerName]);

  // Resume a saved draft by id (localStorage-backed, client-only).
  const initialDraft = useMemo<NamedDraft | null>(() => {
    if (!draftId) return null;
    const entry = listDraftEntries().find((d) => d.key === draftId);
    return entry?.draft ?? null;
  }, [draftId]);

  return (
    <LogActivityForm
      canViewLeads={canViewLeads}
      // Lead context takes precedence (carries badges); otherwise the generic
      // related record. If both are derivable they describe the same Lead.
      initialLead={initialLead}
      initialRelated={initialLead ? null : initialRelated}
      initialDraft={initialDraft}
      // Post-save → the unified Activities timeline (per product decision).
      onDone={() => router.push("/activities")}
      // Cancel → back to wherever the user came from.
      onCancel={() => router.back()}
    />
  );
}
