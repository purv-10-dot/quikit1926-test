import { redirect } from "next/navigation";

/**
 * Global 404 boundary. Sends the user to the public landing (`/`): a signed-in
 * user is forwarded to `/dashboard` by the landing page; a signed-out user sees
 * the landing (or is gated to login by middleware on protected paths).
 */
export default function NotFound() {
  redirect("/");
}
