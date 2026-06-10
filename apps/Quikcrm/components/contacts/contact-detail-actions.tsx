"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  CreateOpportunityModal,
  type CreateOpportunityResult,
} from "@/components/opportunities/create-opportunity-modal";

interface Props {
  contactId: string;
  contactFullName: string;
  accountId: string | null;
  accountName: string | null;
}

export function ContactDetailActions({
  contactId,
  contactFullName,
  accountId,
  accountName,
}: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const linked = Boolean(accountId && accountName);

  function handleSuccess(result: CreateOpportunityResult) {
    toast.success("Opportunity created");
    // Per UX choice: stay on the contact page, surface a link via a follow-up
    // toast so the rep can jump to the new opp without losing context.
    setTimeout(() => {
      toast.info(`View opportunity → /opportunities/${result.opportunityId}`);
    }, 50);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => linked && setOpen(true)}
        disabled={!linked}
        title={
          linked
            ? "Create a new Opportunity linked to this contact's account"
            : "Link this contact to an Account first."
        }
        className="crm-btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Create Opportunity"
      >
        <Plus size={14} /> Create Opportunity
      </button>

      {linked && accountId && accountName && (
        <CreateOpportunityModal
          open={open}
          onClose={() => setOpen(false)}
          contactId={contactId}
          contactFullName={contactFullName}
          accountId={accountId}
          accountName={accountName}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
