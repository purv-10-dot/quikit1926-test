import { redirect } from "next/navigation";

/**
 * Global 404 boundary. Instead of dead-ending on Next's bare 404, send the user
 * to this app's landing page ("/"), which role-routes a signed-in user to their
 * portal home; a signed-out user is gated to login by middleware on protected
 * paths. Relative path → host-agnostic.
 */
export default function NotFound() {
  redirect("/");
}
