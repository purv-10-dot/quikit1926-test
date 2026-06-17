"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Mail } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { buildGmailComposeUrl, openMailtoCompose } from "@/lib/utils/mailto";
import { useToast } from "@/hooks/use-toast";

export type ComposeEmailBlockReason = "missing" | "hidden";

interface Props {
  open: boolean;
  onClose: () => void;
  leadName: string;
  /** Address the user may send to (null when missing or hidden). */
  to: string | null;
  blockReason?: ComposeEmailBlockReason | null;
  onGoToDetails?: () => void;
}

export function CommandEmailModal({
  open,
  onClose,
  leadName,
  to,
  blockReason = null,
  onGoToDetails,
}: Props) {
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) return;
    setSubject(`Regarding ${leadName}`);
    setBody("");
  }, [open, leadName]);

  const address = to?.trim() ?? "";

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Email copied");
    } catch {
      toast.error("Could not copy email");
    }
  }

  function openDefaultMailApp() {
    if (!address) return;
    try {
      openMailtoCompose({ to: address, subject, body });
      onClose();
    } catch {
      toast.error("Could not open mail app");
    }
  }

  function openGmail() {
    if (!address) return;
    const url = buildGmailComposeUrl({ to: address, subject, body });
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Email · ${leadName}`} width="max-w-md">
      {blockReason === "hidden" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Email is hidden for your role. Ask an administrator if you need access.
        </p>
      ) : blockReason === "missing" || !address ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-crm-border bg-crm-panel px-3 py-2 text-sm text-crm-text">
            This lead has no email address yet. Add one under the <strong>Details</strong> tab.
          </p>
          {onGoToDetails ? (
            <Button type="button" variant="secondary" onClick={onGoToDetails}>
              Open Details tab
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">
            <span className="flex min-w-0 items-center gap-2">
              <Mail size={16} className="shrink-0" />
              <span className="truncate font-mono">{address}</span>
            </span>
            <button
              type="button"
              onClick={() => void copyAddress()}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100 dark:text-sky-200 dark:hover:bg-sky-900/60"
              title="Copy email"
            >
              <Copy size={14} />
              Copy
            </button>
          </div>

          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-crm-text">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="crm-input w-full"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-crm-text">Message (optional)</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-crm-border px-3 py-2 text-sm"
              placeholder="Optional message…"
            />
          </label>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={openDefaultMailApp}>
              <Mail size={16} className="mr-1.5" />
              Mail app
            </Button>
            <Button type="button" onClick={openGmail}>
              <ExternalLink size={16} className="mr-1.5" />
              Open Gmail
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
