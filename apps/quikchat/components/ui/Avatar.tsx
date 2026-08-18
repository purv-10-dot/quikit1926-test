import * as React from "react";
import type { EffectiveStatus } from "@/lib/presence-store";
import { PresenceIndicator } from "./PresenceIndicator";

const PALETTE = [
  "#534AB7",
  "#1D9E75",
  "#B7574A",
  "#4A86B7",
  "#B79A4A",
  "#8E4AB7",
  "#4AB7A0",
  "#B74A86",
];

/** Deterministic palette color from an id/name (stable across renders). */
export function colorFromId(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// Lowercase to preserve the pre-existing dot contract (callers/tests query the
// `online` label). Case is irrelevant to screen readers; the multi-word forms
// keep the new statuses readable.
const STATUS_LABEL: Record<EffectiveStatus, string> = {
  available: "available",
  online: "online",
  busy: "busy",
  dnd: "do not disturb",
  brb: "be right back",
  away: "away",
  appear_offline: "appearing offline",
  on_call: "on call",
  offline: "offline",
};

export interface AvatarProps {
  name: string;
  /** Seed for the deterministic color (defaults to name). */
  id?: string;
  avatarUrl?: string | null;
  size?: number;
  /**
   * What this avatar depicts. THREE-WAY, not the old `group` boolean:
   *
   *   "person"  — initials or photo on a deterministic colour (DMs, people)
   *   "group"   — a private group. Renders like a person (initials/photo),
   *               because a group IS its members.
   *   "channel" — a public channel. Renders a full-size `#` at the same visual
   *               weight as an avatar, because a channel is a place, not people.
   *
   * The old boolean could not express this: it mapped `type === "group"` to the
   * hash glyph, so private groups and public channels looked identical. The
   * Channel/Group vocabulary split is exactly the distinction it was missing.
   */
  variant?: "person" | "group" | "channel";
  /**
   * Back-compat boolean presence dot (green when true). Prefer `status` for the
   * rich presence variant; when `status` is provided it takes precedence.
   */
  online?: boolean;
  /** Rich presence status — renders the colored variant dot (omit when unknown). */
  status?: EffectiveStatus;
}

export function Avatar({
  name,
  id,
  avatarUrl,
  size = 32,
  variant = "person",
  online,
  status,
}: AvatarProps) {
  const seed = id ?? name;
  const isChannel = variant === "channel";
  // Only channels drop the generated colour — a group keeps it, like a person.
  const bg = isChannel ? undefined : colorFromId(seed);
  const fontSize = Math.round(size * 0.4);

  // Signed media URLs (e.g. a group avatar) are short-lived — a stale one 403s.
  // Degrade gracefully to the glyph/initials instead of a broken-image icon.
  const [imgFailed, setImgFailed] = React.useState(false);
  React.useEffect(() => setImgFailed(false), [avatarUrl]);
  const showImg = !!avatarUrl && !imgFailed;

  // `status` wins when present; otherwise fall back to the legacy boolean. A dot
  // renders for any explicit status INCLUDING offline (gray hollow ring); the
  // boolean back-compat path (`online={false}`, no `status`) stays dot-free.
  const effective: EffectiveStatus | undefined = status ?? (online ? "online" : undefined);
  // Presence dot scales with the avatar but stays in the "small" glyph regime;
  // fine glyphs appear on the larger picker/own indicators (see PresenceIndicator).
  const dotSize = Math.max(10, Math.round(size * 0.3));

  return (
    <span
      className={`qc-avatar${isChannel ? " qc-avatar--channel" : ""}`}
      style={{ width: size, height: size }}
      aria-label={name}
    >
      <span className="qc-avatar__inner" style={{ background: bg, fontSize }}>
        {showImg ? (
          <img src={avatarUrl!} alt={name} onError={() => setImgFailed(true)} />
        ) : isChannel ? (
          <span className="qc-avatar__hash" aria-hidden="true">
            #
          </span>
        ) : (
          initials(name)
        )}
      </span>
      {effective ? (
        <span className="qc-presence-dot" aria-label={STATUS_LABEL[effective]}>
          <PresenceIndicator status={effective} size={dotSize} />
        </span>
      ) : null}
    </span>
  );
}
