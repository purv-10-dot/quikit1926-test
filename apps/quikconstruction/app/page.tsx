import { redirect } from "next/navigation";

/**
 * Root redirect — send users to the dashboard.
 */
export default function RootPage() {
  redirect("/dashboard");
}
