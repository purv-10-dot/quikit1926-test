"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export function OrderCancelModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title="Cancel order">
      <p className="text-sm text-crm-muted">
        Cancelling an order is reversible only via a new conversion from the source quote.
        Please record the reason — it&apos;s required for the audit log.
      </p>
      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-medium text-crm-text">
          Cancellation reason <span className="text-red-500">*</span>
        </span>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </label>
      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button
          variant="danger"
          onClick={async () => {
            if (!reason.trim()) return;
            setSubmitting(true);
            await onConfirm(reason.trim());
            setSubmitting(false);
            setReason("");
          }}
          disabled={submitting || !reason.trim()}
        >
          <X size={14} /> Confirm cancel
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Back
        </Button>
      </div>
    </Modal>
  );
}
