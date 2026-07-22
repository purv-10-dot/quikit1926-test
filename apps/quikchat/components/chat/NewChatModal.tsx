"use client";

import { useState } from "react";
import type { ChannelListItem, PublicUser } from "@/lib/shared";
import { Button, Modal } from "@/components/ui";
import { createChannel } from "@/lib/api";
import { UserPicker } from "./UserPicker";

export interface NewChatModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (channel: ChannelListItem) => void;
}

/** Start (or reopen — the server is idempotent) a DM with one person. */
export function NewChatModal({ open, onClose, onCreated }: NewChatModalProps) {
  const [picked, setPicked] = useState<PublicUser[]>([]);
  const [busy, setBusy] = useState(false);
  const other = picked[0];

  async function start() {
    if (!other) return;
    setBusy(true);
    try {
      const channel = await createChannel({ type: "dm", memberIds: [other.id] });
      onCreated(channel);
      setPicked([]);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New direct message"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !other} onClick={start}>
            Start chat
          </Button>
        </>
      }
    >
      <UserPicker onChange={setPicked} placeholder="Search people to message" />
    </Modal>
  );
}
