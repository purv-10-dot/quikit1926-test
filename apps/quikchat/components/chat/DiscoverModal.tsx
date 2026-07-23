"use client";

import { useEffect, useState } from "react";
import type { ChannelListItem, DiscoverChannelItem } from "@/lib/shared";
import { Avatar, Button, Modal, SearchInput, Spinner } from "@/components/ui";
import { discoverChannels, joinChannel } from "@/lib/api";

export interface DiscoverModalProps {
  open: boolean;
  onClose: () => void;
  onJoined: (channel: ChannelListItem) => void;
}

/** Browse + join public group channels in the org. */
export function DiscoverModal({ open, onClose, onJoined }: DiscoverModalProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<DiscoverChannelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    discoverChannels(debounced || undefined)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [open, debounced]);

  async function join(item: DiscoverChannelItem) {
    setJoining(item.channelId);
    try {
      const channel = await joinChannel(item.channelId);
      onJoined(channel);
      onClose();
    } finally {
      setJoining(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Discover channels">
      <SearchInput
        placeholder="Search public channels"
        aria-label="Search public channels"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div style={{ marginTop: 10 }}>
        {loading && results.length === 0 ? (
          <div style={{ padding: 12 }}>
            <Spinner />
          </div>
        ) : results.length === 0 ? (
          <div className="qc-detail-row">
            <span>No public channels found</span>
          </div>
        ) : (
          results.map((c) => (
            <div key={c.channelId} className="qc-discover-row">
              <Avatar name={c.name ?? "Channel"} id={c.channelId} group size={32} />
              <div className="qc-discover-row__main">
                <div className="qc-discover-row__name">{c.name ?? "Channel"}</div>
                <div className="qc-discover-row__desc">
                  {c.description || `${c.memberCount} member${c.memberCount === 1 ? "" : "s"}`}
                </div>
              </div>
              {c.isMember ? (
                <span className="qc-joined-badge">Joined</span>
              ) : (
                <Button
                  variant="primary"
                  disabled={joining === c.channelId}
                  onClick={() => join(c)}
                >
                  Join
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
