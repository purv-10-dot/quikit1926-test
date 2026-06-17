"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { LeadFieldDefinition } from "@/types/field-definition";

interface Props {
  open: boolean;
  onClose: () => void;
  /** All fields the user could pick from. */
  available: LeadFieldDefinition[];
  /** Keys currently visible — anything else available counts as "hidden". */
  visibleKeys: string[];
  /** Show a hidden column (append to visible list). */
  onShow: (key: string) => void;
}

export function HiddenColumnsModal({ open, onClose, available, visibleKeys, onShow }: Props) {
  const hidden = available.filter((f) => !visibleKeys.includes(f.key));

  return (
    <Modal open={open} onClose={onClose} title="Hide Columns List" width="max-w-md">
      <div className="rounded-lg border border-crm-border">
        {hidden.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-crm-muted">
            No hidden columns. Use the column menu to hide one.
          </p>
        ) : (
          <ul>
            {hidden.map((f) => (
              <li
                key={f.key}
                className="flex items-center justify-between border-b border-crm-border px-4 py-3 text-sm last:border-0"
              >
                <span className="truncate">{f.label}</span>
                <Button
                  variant="secondary"
                  onClick={() => onShow(f.key)}
                >
                  Show
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
