import { redirect } from "next/navigation";

// Root route — send authenticated users to the dashboard.
// Middleware handles the auth guard; unauthenticated users are
// redirected to /login before they reach this page.
export default function RootPage() {
  redirect("/dashboard");
}
