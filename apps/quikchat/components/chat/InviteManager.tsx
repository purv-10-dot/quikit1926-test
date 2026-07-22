"use client";

import { useEffect, useState } from "react";
import type { InviteDto } from "@/lib/shared";
import { Button, Copy, IconButton, Input, Trash2 } from "@/components/ui";
import { createInvite, listInvites, revokeInvite } from "@/lib/api";

export interface InviteManagerProps {
  channelId: string;
}

function inviteUrl(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/invite/${code}`;
}

/** Create / list / revoke channel invite links (group channels). */
export function InviteManager({ channelId }: InviteManagerProps) {
  const [invites, setInvites] = useState<InviteDto[]>([]);
  const [maxUses, setMaxUses] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    listInvites(channelId)
      .then((rows) => active && setInvites(rows))
      .catch(() => active && setInvites([]));
    return () => {
      active = false;
    };
  }, [channelId]);

  async function create() {
    setBusy(true);
    try {
      const body: { maxUses?: number; expiresInMinutes?: number } = {};
      const m = parseInt(maxUses, 10);
      const e = parseInt(expires, 10);
      if (Number.isFinite(m) && m > 0) body.maxUses = m;
      if (Number.isFinite(e) && e > 0) body.expiresInMinutes = e;
      const invite = await createInvite(channelId, body);
      setInvites((prev) => [invite, ...prev]);
      setMaxUses("");
      setExpires("");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await revokeInvite(channelId, id).catch(() => undefined);
    setInvites((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <section className="qc-drawer-section" data-testid="invite-manager">
      <div className="qc-label">Invite links</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <Input
          placeholder="Max uses"
          aria-label="Max uses"
          inputMode="numeric"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
        />
        <Input
          placeholder="Expires (min)"
          aria-label="Expires in minutes"
          inputMode="numeric"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
        />
        <Button variant="primary" disabled={busy} onClick={create}>
          Create
        </Button>
      </div>

      {invites.length === 0 ? (
        <div className="qc-detail-row">
          <span>No active invites</span>
        </div>
      ) : (
        invites.map((inv) => (
          <div key={inv.id} className="qc-invite-row" data-testid="invite-row">
            <div className="qc-invite-link">
              <code>{inviteUrl(inv.code)}</code>
              <IconButton
                label="Copy invite link"
                onClick={() => void navigator.clipboard?.writeText(inviteUrl(inv.code))}
              >
                <Copy size={14} />
              </IconButton>
            </div>
            <IconButton label="Revoke invite" onClick={() => revoke(inv.id)}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))
      )}
    </section>
  );
}
