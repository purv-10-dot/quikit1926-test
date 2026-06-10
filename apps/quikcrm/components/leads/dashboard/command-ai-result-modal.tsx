"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  copyLabel?: string;
}

export function CommandAiResultModal({
  open,
  onClose,
  title,
  body,
  copyLabel = "Copy to clipboard",
}: Props) {
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy — select text manually");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-lg">
      <p className="mb-2 text-xs text-crm-muted">
        Generated from CRM activity signals (rule-based — not an external AI model).
      </p>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-crm-border bg-crm-panel p-3 text-sm text-crm-text">
        {body}
      </pre>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button onClick={() => void copy()}>{copyLabel}</Button>
      </div>
    </Modal>
  );
}
