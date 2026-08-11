"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export type QuickPickKind = "owner" | "stage" | "status";

interface Option {
  value: string;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  kind: QuickPickKind;
  title: string;
  options: Option[];
  currentValue: string;
  saving?: boolean;
  onSave: (value: string) => void | Promise<void>;
}

const KIND_LABEL: Record<QuickPickKind, string> = {
  owner: "Owner",
  stage: "Stage",
  status: "Status",
};

export function CommandQuickPickModal({
  open,
  onClose,
  kind,
  title,
  options,
  currentValue,
  saving = false,
  onSave,
}: Props) {
  const [value, setValue] = useState(currentValue);

  useEffect(() => {
    if (open) setValue(currentValue);
  }, [open, currentValue]);

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-crm-text">
          {KIND_LABEL[kind]}
        </span>
        <Select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={saving}
        >
          {kind === "owner" ? <option value="">Unassigned</option> : null}
          {options.map((o) => (
            <option key={o.value || "__empty"} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={() => void onSave(value)}
          disabled={saving || value === currentValue}
        >
          {saving ? "Saving…" : "Apply"}
        </Button>
      </div>
    </Modal>
  );
}
