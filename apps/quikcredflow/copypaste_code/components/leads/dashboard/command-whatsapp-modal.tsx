"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  leadName: string;
  phone: string;
  onOpenCommunications?: () => void;
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function CommandWhatsAppModal({
  open,
  onClose,
  leadName,
  phone,
  onOpenCommunications,
}: Props) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setMessage(`Hi ${leadName.split(/\s+/)[0] || leadName}, following up from our CRM.`);
  }, [open, leadName]);

  function openWhatsApp() {
    const n = digitsOnly(phone);
    if (!n) return;
    const text = encodeURIComponent(message.trim());
    const url = text ? `https://wa.me/${n}?text=${text}` : `https://wa.me/${n}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenCommunications?.();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`WhatsApp · ${leadName}`} width="max-w-md">
      <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <MessageCircle size={16} className="shrink-0" />
        <span className="font-mono">{phone}</span>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-crm-text">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-crm-border px-3 py-2 text-sm"
          placeholder="Optional pre-filled message…"
        />
      </label>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {onOpenCommunications ? (
          <Button variant="secondary" onClick={() => { onOpenCommunications(); onClose(); }}>
            Open comm hub
          </Button>
        ) : null}
        <Button onClick={openWhatsApp}>Open WhatsApp</Button>
      </div>
    </Modal>
  );
}
