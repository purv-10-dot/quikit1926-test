"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  CreateOpportunityModal,
  type CreateOpportunityResult,
} from "@/components/opportunities/create-opportunity-modal";
import {
  ContactForm,
  EMPTY_CONTACT_FORM,
  type ContactFormServerError,
  type ContactFormValue,
} from "@/components/contacts/contact-form";

interface CreateOppContext {
  id: string;
  fullName: string;
  accountId: string;
  accountName: string;
}

export interface ContactRow {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  accountId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  leadId: string | null;
  city: string | null;
  contactStage: string | null;
  source: string | null;
  accountName?: string | null;
  deletedAt?: string | null;
}

interface PickerOption {
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  mode: "create" | "edit";
  contact?: ContactRow | null;
  canEdit: boolean;
  canDelete: boolean;
  saving?: boolean;
  deleting?: boolean;
  serverError?: ContactFormServerError;
  accountOptions: PickerOption[];
  ownerOptions: PickerOption[];
  leadOptions: PickerOption[];
  pickersLoading?: boolean;
  onClose: () => void;
  onSubmit: (value: ContactFormValue) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}

function rowToFormValue(c: ContactRow | null | undefined): Partial<ContactFormValue> {
  if (!c) return EMPTY_CONTACT_FORM;
  return {
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    title: c.title ?? "",
    accountId: c.accountId ?? "",
    ownerId: c.ownerId ?? "",
    leadId: c.leadId ?? "",
    city: c.city ?? "",
    contactStage: c.contactStage ?? "",
    source: c.source ?? "",
  };
}

export function ContactModal({
  open,
  mode,
  contact,
  canEdit,
  canDelete,
  saving,
  deleting,
  serverError,
  accountOptions,
  ownerOptions,
  leadOptions,
  pickersLoading,
  onClose,
  onSubmit,
  onDelete,
}: Props) {
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Create-Opportunity state is OWNED here (not inside the edit modal's body)
  // so it survives when the edit modal closes. We snapshot the contact data
  // at click-time into `createOpp` because the `contact` prop becomes null as
  // soon as the parent (contacts-list-client) clears its `editing` state.
  const [createOpp, setCreateOpp] = useState<CreateOppContext | null>(null);

  useEffect(() => {
    if (!open) setConfirmDelete(false);
  }, [open]);

  function openCreateOpportunity() {
    if (!contact || !contact.accountId || !contact.accountName) return;
    setCreateOpp({
      id: contact.id,
      fullName: `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim(),
      accountId: contact.accountId,
      accountName: contact.accountName,
    });
    onClose(); // close the edit modal — single-modal UX
  }

  function handleCreateOppSuccess(result: CreateOpportunityResult) {
    toast.success("Opportunity created");
    setTimeout(() => {
      toast.info(`View opportunity → /opportunities/${result.opportunityId}`);
    }, 50);
  }

  const canCreateOpportunity = Boolean(
    mode === "edit" && contact?.accountId && contact?.accountName,
  );

  const readOnly = !canEdit;
  const title =
    mode === "create"
      ? "Add contact"
      : contact
      ? `Edit contact — ${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim()
      : "Edit contact";

  return (
    <>
      <Modal open={open} onClose={onClose} title={title} width="max-w-2xl">
        <ContactForm
          mode={mode}
          initial={rowToFormValue(contact)}
          readOnly={readOnly}
          saving={saving}
          serverError={serverError}
          accountOptions={accountOptions}
          ownerOptions={ownerOptions}
          leadOptions={leadOptions}
          showLeadPicker={mode === "edit"}
          pickersLoading={pickersLoading}
          onSubmit={(v) => {
            void onSubmit(v);
          }}
          onCancel={onClose}
        />

        {mode === "edit" && contact && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-crm-border pt-3">
            <button
              type="button"
              onClick={openCreateOpportunity}
              disabled={!canCreateOpportunity}
              title={
                canCreateOpportunity
                  ? "Create a new Opportunity linked to this contact's account"
                  : "Link this contact to an Account first."
              }
              className="crm-btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Create Opportunity"
            >
              <Plus size={14} /> Create Opportunity
            </button>
            {canDelete && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
              >
                Move to Trash
              </Button>
            )}
          </div>
        )}
      </Modal>

      {createOpp && (
        <CreateOpportunityModal
          open={Boolean(createOpp)}
          onClose={() => setCreateOpp(null)}
          contactId={createOpp.id}
          contactFullName={createOpp.fullName}
          accountId={createOpp.accountId}
          accountName={createOpp.accountName}
          onSuccess={handleCreateOppSuccess}
        />
      )}

      {confirmDelete && contact && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
        >
          <div className="w-full max-w-md rounded-lg border border-crm-border bg-white p-5 shadow-lg">
            <h2 className="text-base font-semibold text-crm-text">
              Move to Trash?
            </h2>
            <p className="mt-2 text-sm text-crm-muted">
              &quot;
              {`${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() ||
                "—"}
              &quot; will be moved to Trash. You can restore it later.
            </p>
            <div className="mt-4 flex flex-row-reverse gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={deleting}
                onClick={async () => {
                  if (onDelete) await onDelete();
                  setConfirmDelete(false);
                }}
              >
                {deleting ? "Moving…" : "Move to Trash"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
