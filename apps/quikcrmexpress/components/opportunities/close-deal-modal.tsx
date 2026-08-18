"use client";

import { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Button,
  Textarea,
  Select,
} from "@quikit/ui";
import { CLOSE_REASON_CATEGORIES, STAGE_LABEL } from "@/lib/services/opportunities/stage-labels";

export function CloseDealModal({
  open,
  toStage,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  toStage: "ClosedWon" | "ClosedLost";
  onClose: () => void;
  onConfirm: (input: { closeReasonCategory: string; closeReason: string }) => void;
  loading?: boolean;
}) {
  const [category, setCategory] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const choices = CLOSE_REASON_CATEGORIES[toStage] as readonly string[];

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Mark deal as {STAGE_LABEL[toStage]}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <label className="block text-sm font-medium">
              Reason category <span className="text-red-500">*</span>
              <Select
                className="mt-1"
                required
                value={category}
                onChange={(e) =>
                  setCategory((e.target as HTMLSelectElement).value)
                }
                options={[
                  { value: "", label: "Select a category" },
                  ...choices.map((c) => ({ value: c, label: c })),
                ]}
              />
            </label>
            <label className="block text-sm font-medium">
              Notes (optional)
              <Textarea
                className="mt-1"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Anything the team should know about this outcome…"
                rows={4}
              />
            </label>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm({ closeReasonCategory: category, closeReason: reason })}
            disabled={!category || loading}
          >
            Confirm {STAGE_LABEL[toStage]}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
