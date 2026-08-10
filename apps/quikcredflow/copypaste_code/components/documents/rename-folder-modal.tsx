"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}

export function RenameFolderModal({ open, initialName, onClose, onRename }: Props) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onRename(name.trim());
      onClose();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Rename folder" width="max-w-md">
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
