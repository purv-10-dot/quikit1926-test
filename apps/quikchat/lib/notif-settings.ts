/**
 * Pure helpers for the notification settings + per-channel mute UI: snooze/mute
 * timestamp computation, DND validation, and human labels. Kept pure (time is
 * injected) so the forms stay thin and these are unit-testable.
 */

export type SnoozeOption = "30m" | "1h" | "8h" | "tomorrow";

/** Compute an ISO timestamp for a quick snooze/mute option. */
export function untilIso(option: SnoozeOption, now: number = Date.now()): string {
  switch (option) {
    case "30m":
      return new Date(now + 30 * 60_000).toISOString();
    case "1h":
      return new Date(now + 60 * 60_000).toISOString();
    case "8h":
      return new Date(now + 8 * 60 * 60_000).toISOString();
    case "tomorrow": {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0); // tomorrow morning, local
      return d.toISOString();
    }
  }
}

/** Is the timestamp still in the future (active snooze/mute)? */
export function isActive(iso: string | null | undefined, now: number = Date.now()): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t) && t > now;
}

/** Short human label, e.g. "until 3:45 PM" or "until Jun 19, 8:00 AM". */
export function formatUntil(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `until ${time}`;
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `until ${date}, ${time}`;
}

/**
 * DND requires both HH:MM bounds when enabled — mirror of the server rule. When
 * disabled, always valid.
 */
export function dndValid(enabled: boolean, start: string | null, end: string | null): boolean {
  if (!enabled) return true;
  const ok = (s: string | null): boolean => !!s && /^\d{2}:\d{2}$/.test(s);
  return ok(start) && ok(end);
}

/**
 * Is the user inside their DND window right now (local time)? Used client-side
 * to suppress the incoming-call ringtone — the visual toast is never gated.
 *
 * ⚠️ KEEP IN SYNC WITH `isInDndWindow` in `lib/server/notifications.service.ts`.
 * That is the authoritative copy (it gates notification delivery); this is a
 * deliberate client-safe duplicate, because the server module imports Prisma and
 * cannot be pulled into the browser bundle. Same rules: [start, end), overnight
 * wrap supported, start === end ⇒ never. If you change the semantics in one
 * place, change both — the tests in notif-settings.test.ts mirror the server's.
 */
export function dndActiveNow(
  enabled: boolean,
  start: string | null,
  end: string | null,
  now: Date = new Date(),
): boolean {
  if (!enabled || !start || !end) return false;
  const parse = (s: string) => {
    const [h, m] = s.split(":").map((x) => parseInt(x, 10));
    return (h || 0) * 60 + (m || 0);
  };
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startM = parse(start);
  const endM = parse(end);
  if (startM === endM) return false;
  if (startM < endM) return nowMinutes >= startM && nowMinutes < endM;
  // Overnight window (e.g. 22:00 → 07:00).
  return nowMinutes >= startM || nowMinutes < endM;
}
