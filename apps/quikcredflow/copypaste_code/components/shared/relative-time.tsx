"use client";

import { useHasMounted } from "@/hooks/use-has-mounted";
import { formatDateTime } from "@/lib/utils/date-helpers";

function relativeLabel(iso: string): string {
  const date = new Date(iso);
  const ms = Date.now() - date.getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return formatDateTime(iso);
}

interface Props {
  iso: string;
  className?: string;
}

/** Relative time safe for SSR — shows absolute UTC timestamp until mounted. */
export function RelativeTime({ iso, className }: Props) {
  const mounted = useHasMounted();
  const label = mounted ? relativeLabel(iso) : formatDateTime(iso);
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {label}
    </time>
  );
}
