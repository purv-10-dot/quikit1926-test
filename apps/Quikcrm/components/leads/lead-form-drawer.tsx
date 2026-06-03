"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/drawer";
import { LeadForm } from "@/components/leads/lead-form";
import { discardLeadFormDraft, type LeadFormDraftScope } from "@/lib/leads/lead-form-draft";

type LeadFormInitial = NonNullable<React.ComponentProps<typeof LeadForm>["initial"]>;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-fill fields (e.g. accountId when creating from an account page). */
  initial?: LeadFormInitial;
  /** Called after a lead is created — caller typically refreshes the list. */
  onCreated?: (leadId: string) => void;
}

const FORM_ID = "lead-create-form";

function draftScopeForInitial(initial?: LeadFormInitial): LeadFormDraftScope {
  if (initial?.accountId) return `create:account:${initial.accountId}`;
  return "create";
}

export function LeadFormDrawer({ open, onClose, initial, onCreated }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const draftScope = draftScopeForInitial(initial);

  function handleClose() {
    discardLeadFormDraft(draftScope);
    onClose();
  }

  function handleSaved(lead: { id: string }) {
    setSubmitting(false);
    handleClose();
    if (onCreated) onCreated(lead.id);
    else {
      router.push(`/leads/${lead.id}`);
      router.refresh();
    }
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Add lead"
      description="Create the record, upload documents, and optionally schedule a follow-up task."
      width="max-w-2xl"
      footer={null}
    >
      <LeadForm
        key={initial?.accountId ?? "new"}
        formId={FORM_ID}
        initial={initial}
        draftScope={draftScope}
        hideFooter
        onSaved={handleSaved}
        onCancel={handleClose}
        onSubmittingChange={setSubmitting}
      />
    </Drawer>
  );
}
