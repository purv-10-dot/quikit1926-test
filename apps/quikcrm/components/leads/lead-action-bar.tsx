"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LeadCallDispositionModal } from "@/components/leads/call-disposition-modal";
import { CallModal } from "@/components/telephony/call-modal";
import { ConvertLeadModal, type ConvertResult } from "@/components/leads/convert-lead-modal";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface Props {
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  leadMobile?: string | null;
  leadStage?: string | null;
  leadCompany?: string | null;
  linkedContactId?: string | null;
  /** Pre-fetched dynamic dispositions from /api/telephony/dispositions. */
  dispositionSections: { id: string; code: string; label: string }[];
  canLogActivity?: boolean;
}

export function LeadActionBar({
  leadId,
  leadName,
  leadPhone,
  leadMobile,
  leadStage,
  leadCompany,
  linkedContactId,
  dispositionSections,
  canLogActivity = true,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [smbOpen, setSmbOpen] = useState(false);
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  function openDialer() {
    if (!leadPhone) {
      toast.error("Lead has no phone number");
      return;
    }
    setCallOpen(true);
  }

  function handleConvertSuccess(result: ConvertResult) {
    if (result.opportunityId) {
      toast.success("Lead converted with opportunity");
    } else {
      toast.success("Lead converted to contact");
    }
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canLogActivity ? (
          <Link
            href={`/activities/log?relatedKind=Lead&relatedObjectId=${encodeURIComponent(leadId)}&label=${encodeURIComponent(leadName)}`}
            className="crm-btn-secondary"
          >
            Log activity
          </Link>
        ) : (
          <button disabled className="crm-btn-secondary disabled:opacity-50">
            Log activity
          </button>
        )}
        <button
          onClick={() => setSmbOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-crm-blue px-4 py-2 text-sm font-medium text-white shadow-sm hover:brightness-110"
        >
          SMB Outreach
        </button>
        {linkedContactId ? (
          <Link
            href={`/contacts/${linkedContactId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
            title="This lead has been converted to a contact"
          >
            <CheckCircle2 size={14} /> Converted
          </Link>
        ) : (
          <button onClick={() => setConvertOpen(true)} className="crm-btn-secondary">
            Convert to Contact
          </button>
        )}
        <button
          onClick={() => setDispositionOpen(true)}
          className="crm-btn-secondary inline-flex items-center gap-1.5"
        >
          <Phone size={14} /> Call disposition
        </button>
        <button onClick={openDialer} className="crm-btn-secondary text-crm-blue">
          Open dialer
        </button>
      </div>

      <Modal open={smbOpen} onClose={() => setSmbOpen(false)} title="SMB Outreach">
        <p className="text-sm text-crm-muted">
          {/* TODO(post-mvp): port full SMB outreach modal from quikcrm-frontend (multi-step disposition,
              metadata fields, payment-verification trigger). Backend endpoints
              POST /api/activities/smb-outreach + GET /api/activities/smb-outreach/meta still needed. */}
          The SMB Outreach flow links a call disposition to an outreach activity and (optionally) opens
          a payment verification request. Backend endpoint{" "}
          <code>POST /activities/smb-outreach</code> needs to be added to enable this flow.
        </p>
        <div className="mt-3 flex justify-end">
          <Button variant="secondary" onClick={() => setSmbOpen(false)}>
            Close
          </Button>
        </div>
      </Modal>

      <LeadCallDispositionModal
        open={dispositionOpen}
        leadId={leadId}
        leadStage={leadStage ?? undefined}
        defaultToNumber={(leadMobile || leadPhone || "").trim()}
        onClose={() => setDispositionOpen(false)}
        onSaved={() => router.refresh()}
      />

      <CallModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        to={leadPhone}
        leadId={leadId}
        leadName={leadName}
        leadStage={leadStage}
        dispositionSections={dispositionSections}
      />

      <ConvertLeadModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        leadId={leadId}
        leadName={leadName}
        leadCompany={leadCompany}
        onSuccess={handleConvertSuccess}
      />
    </>
  );
}
