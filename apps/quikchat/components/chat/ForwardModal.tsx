"use client";

import { useState } from "react";
import type { ChannelList, ChannelListItem, MessageDto } from "@/lib/shared";
import { Avatar, Button, Check, Input, Modal } from "@/components/ui";
import { avatarVariantFor } from "./ChannelList";

export interface ForwardModalProps {
  open: boolean;
  message: MessageDto | null;
  channels: ChannelList | undefined;
  onClose: () => void;
  onForward: (messageId: string, channelIds: string[], note: string) => Promise<void> | void;
}

export function ForwardModal({ open, message, channels, onClose, onForward }: ForwardModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const items: ChannelListItem[] = channels ? [...channels.priority, ...channels.recent] : [];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!message || selected.size === 0) return;
    setBusy(true);
    try {
      await onForward(message.id, [...selected], note.trim());
      setSelected(new Set());
      setNote("");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Forward message"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || selected.size === 0} onClick={submit}>
            Forward{selected.size ? ` (${selected.size})` : ""}
          </Button>
        </>
      }
    >
      <Input
        placeholder="Add a note (optional)"
        aria-label="Forward note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div style={{ marginTop: 10 }} role="listbox" aria-label="Choose conversations">
        {items.map((c) => (
          <button
            key={c.channelId}
            type="button"
            className="qc-pick-row"
            data-selected={selected.has(c.channelId)}
            aria-pressed={selected.has(c.channelId)}
            onClick={() => toggle(c.channelId)}
          >
            <Avatar
              name={c.name ?? "Conversation"}
              id={c.channelId}
              variant={avatarVariantFor(c)}
              size={28}
            />
            <span style={{ flex: 1 }}>{c.name ?? "Direct message"}</span>
            {selected.has(c.channelId) ? <Check size={16} /> : null}
          </button>
        ))}
      </div>
    </Modal>
  );
}
