"use client";

import { useState } from "react";
import type { ChannelListItem, ChannelVisibility, PublicUser } from "@/lib/shared";
import { Button, Input, Modal } from "@/components/ui";
import { createChannel } from "@/lib/api";
import { UserPicker } from "./UserPicker";

export interface NewGroupModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (channel: ChannelListItem) => void;
  /**
   * Which thing is being created. The two are one modal because they differ
   * only in visibility — but the user never chooses between them here, they
   * chose by which `+` they clicked:
   *
   *   "group"   → private, no visibility control at all
   *   "channel" → public, LOCKED, name required
   *
   * Replaces the old `canCreatePublic` boolean, which offered "Public —
   * discoverable" as a dropdown option and left the choice mid-flow. The
   * permission now gates the ENTRY POINT (the Channels `+` in the sidebar), so
   * by the time this renders in channel mode the caller already holds the grant.
   * The server still enforces it on create.
   */
  mode?: "group" | "channel";
}

export function NewGroupModal({
  open,
  onClose,
  onCreated,
  mode = "group",
}: NewGroupModalProps) {
  const isChannel = mode === "channel";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [busy, setBusy] = useState(false);

  // Visibility is now decided by the entry point, not by the user mid-flow.
  const visibility: ChannelVisibility = isChannel ? "public" : "private";
  // Mirror the server rule for instant feedback: public channels need a name.
  const nameRequired = isChannel;
  const canCreate = !busy && (!nameRequired || name.trim().length > 0);

  async function create() {
    if (!canCreate) return;
    setBusy(true);
    try {
      const channel = await createChannel({
        type: "group",
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        visibility,
        memberIds: members.map((m) => m.id),
      });
      onCreated(channel);
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setName("");
    setDescription("");
    setMembers([]);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isChannel ? "New channel" : "New group"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canCreate} onClick={create}>
            {isChannel ? "Create channel" : "Create group"}
          </Button>
        </>
      }
    >
      <label className="qc-label" htmlFor="group-name">
        Name {nameRequired ? "(required)" : ""}
      </label>
      <Input
        id="group-name"
        placeholder="e.g. design-team"
        aria-label={isChannel ? "Channel name" : "Group name"}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div style={{ height: 8 }} />
      <Input
        placeholder="Description (optional)"
        aria-label={isChannel ? "Channel description" : "Group description"}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div style={{ height: 8 }} />
      {/* No visibility control: the entry point already decided. Plain copy so
          the user still knows who will be able to see this. */}
      <p className="qc-modal-note">
        {isChannel
          ? "Anyone in your organisation can find and join this channel."
          : "Private — only people you add can see this group."}
      </p>
      <div style={{ height: 10 }} />
      <label className="qc-label">Members</label>
      <UserPicker multi onChange={setMembers} placeholder="Add people" />
    </Modal>
  );
}
