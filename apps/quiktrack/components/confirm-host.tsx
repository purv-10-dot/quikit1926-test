"use client";

import { useEffect, useState } from "react";
import { Button } from "@quikit/ui";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@quikit/ui/modal";
import { QT_CONFIRM_EVENT, type ConfirmRequest } from "@/lib/ui/confirm";

/**
 * Global confirmation dialog. Mount once in the dashboard layout. Any code can
 * await a confirmation via `confirmDialog({ message })` from `@/lib/ui/confirm`
 * — replaces the native `window.confirm`. Resolves false on cancel/dismiss.
 */
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    function onConfirm(e: Event) {
      const detail = (e as CustomEvent<ConfirmRequest>).detail;
      if (detail?.message) setReq(detail);
    }
    window.addEventListener(QT_CONFIRM_EVENT, onConfirm);
    return () => window.removeEventListener(QT_CONFIRM_EVENT, onConfirm);
  }, []);

  function settle(ok: boolean) {
    req?.resolve(ok);
    setReq(null);
  }

  return (
    <Modal open={!!req} onOpenChange={(open) => !open && settle(false)}>
      {req && (
        <ModalContent>
          <ModalHeader>
            <ModalTitle>{req.title ?? "Are you sure?"}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-text-secondary whitespace-pre-line">{req.message}</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              {req.cancelText ?? "Cancel"}
            </Button>
            <Button
              onClick={() => settle(true)}
              className={
                req.danger
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }
            >
              {req.confirmText ?? "Confirm"}
            </Button>
          </ModalFooter>
        </ModalContent>
      )}
    </Modal>
  );
}
