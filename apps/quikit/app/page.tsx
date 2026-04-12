import { redirect } from "next/navigation";

/**
 * Root page — redirects to /apps (the launcher).
 * If not authenticated, middleware will catch and redirect to /login.
 */
export default function HomePage() {
  redirect("/apps");
}
