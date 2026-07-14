import * as React from "react";

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

export interface AvatarProps {
  name: string;
  /** Seed for the deterministic color (defaults to name). */
  id?: string;
  avatarUrl?: string | null;
  size?: number;
  /** Group channels render a rounded-square with a hash glyph. */
  group?: boolean;
  /** Show the teal presence dot. Omit when presence is unknown. */
  online?: boolean;
}

export function Avatar({ name, id, avatarUrl, size = 32, group = false, online }: AvatarProps) {
  const seed = id ?? name;
  const bg = group ? undefined : colorFromId(seed);
  const fontSize = Math.round(size * 0.4);

  return (
    <span
      className={`qc-avatar${group ? " qc-avatar--group" : ""}`}
      style={{ width: size, height: size }}
      aria-label={name}
    >
      <span className="qc-avatar__inner" style={{ background: bg, fontSize }}>
        {avatarUrl ? <img src={avatarUrl} alt={name} /> : group ? "#" : initials(name)}
      </span>
      {online ? <span className="qc-presence-dot" aria-label="online" /> : null}
    </span>
  );
}
