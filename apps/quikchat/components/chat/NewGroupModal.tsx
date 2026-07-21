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
   * DECISION 2 — whether to offer the "public" visibility option. Driven by the
   * caller's `Channel.Public:create` grant (computed once in ChatWorkspace).
   * Defaults to `true` so non-gated callers/tests are unaffected. UX only; the
   * server also enforces the grant on create.
   */
  canCreatePublic?: boolean;
}

export function NewGroupModal({
  open,
  onClose,
  onCreated,
  canCreatePublic = true,
}: NewGroupModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<ChannelVisibility>("private");
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [busy, setBusy] = useState(false);

  // Mirror the server rule for instant feedback: public groups need a name.
  const nameRequired = visibility === "public";
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
    setVisibility("private");
    setMembers([]);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New group"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canCreate} onClick={create}>
            Create group
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
        aria-label="Group name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div style={{ height: 8 }} />
      <Input
        placeholder="Description (optional)"
        aria-label="Group description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div style={{ height: 8 }} />
      <label className="qc-label" htmlFor="group-visibility">
        Visibility
      </label>
      <select
        id="group-visibility"
        className="qc-input"
        aria-label="Visibility"
        value={visibility}
        onChange={(e) => setVisibility(e.target.value as ChannelVisibility)}
      >
        <option value="private">Private — invite only</option>
        {canCreatePublic && <option value="public">Public — discoverable</option>}
      </select>
      <div style={{ height: 10 }} />
      <label className="qc-label">Members</label>
      <UserPicker multi onChange={setMembers} placeholder="Add people" />
    </Modal>
  );
}
