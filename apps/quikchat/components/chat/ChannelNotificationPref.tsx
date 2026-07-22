"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotificationLevel, NotificationPreferenceDto } from "@/lib/shared";
import { Button, Segmented, useToast } from "@/components/ui";
import {
  fetchChannelNotificationPreference,
  patchChannelNotificationPreference,
} from "@/lib/api";
import { formatUntil, isActive, untilIso, type SnoozeOption } from "@/lib/notif-settings";

const LEVELS: { label: string; value: NotificationLevel }[] = [
  { label: "All", value: "all" },
  { label: "Mentions", value: "mentions" },
  { label: "None", value: "none" },
];

/**
 * Per-channel notification override + temporary mute, shown in the InfoDrawer.
 * Mirrors the persist-but-still-recorded mute behaviour from S10a (muting never
 * loses the activity row; it just keeps the bell + OS quiet).
 */
export function ChannelNotificationPref({ channelId }: { channelId: string }) {
  const toast = useToast();
  const [pref, setPref] = useState<NotificationPreferenceDto | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchChannelNotificationPreference(channelId)
      .then((p) => {
        if (alive) setPref(p);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [channelId]);

  const patch = useCallback(
    async (partial: { level?: NotificationLevel; mutedUntil?: string | null }) => {
      const prev = pref;
      setPref((p) => ({
        channelId,
        level: p?.level ?? null,
        mutedUntil: p?.mutedUntil ?? null,
        ...partial,
      }));
      try {
        setPref(await patchChannelNotificationPreference(channelId, partial));
      } catch {
        setPref(prev);
        toast.error({ title: "Couldn't update channel notifications" });
      }
    },
    [channelId, pref, toast],
  );

  const muted = isActive(pref?.mutedUntil);

  return (
    <section className="qc-drawer-section" data-testid="channel-notif-pref">
      <div className="qc-label">Notifications</div>

      <div className="qc-nset__row">
        <div>
          <div className="qc-nset__k">Notify me about</div>
          {!pref?.level ? <div className="qc-nset__d">No override — using your default</div> : null}
        </div>
        <Segmented
          label="Channel notification level"
          options={LEVELS}
          value={(pref?.level ?? "") as NotificationLevel}
          onChange={(v) => void patch({ level: v })}
        />
      </div>

      <div className="qc-nset__row qc-nset__row--block">
        <div className="qc-nset__k">Mute temporarily</div>
        <div className="qc-nset__d">Feed still records it; the bell stays quiet.</div>
        {muted ? (
          <div className="qc-snooze-active">
            <span>Muted {formatUntil(pref!.mutedUntil!)}</span>
            <Button variant="ghost" onClick={() => void patch({ mutedUntil: null })}>
              Unmute
            </Button>
          </div>
        ) : (
          <div className="qc-snooze-opts">
            {(["1h", "8h", "tomorrow"] as SnoozeOption[]).map((opt) => (
              <button
                key={opt}
                type="button"
                className="qc-btn"
                onClick={() => void patch({ mutedUntil: untilIso(opt) })}
              >
                {opt === "1h" ? "1 hour" : opt === "8h" ? "8 hours" : "Until tomorrow"}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
