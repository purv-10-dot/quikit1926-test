import { redirect } from "next/navigation";

/**
 * Root 404 → send the user to `/`.
 *
 * Byte-identical to quikscale, quikinfra and quiktrack's not-found.tsx (3/3).
 * `/` is public and self-redirects authenticated users to /dashboard, so one
 * destination serves both signed-in and signed-out visitors.
 *
 * This previously rendered a styled 404 page. That was arguably nicer, but it
 * was the only such page in the monorepo and it hardcoded #2563eb, which this
 * app's CLAUDE.md forbids for branded elements (accent-* only).
 */
export default function NotFound() {
  redirect("/");
}
