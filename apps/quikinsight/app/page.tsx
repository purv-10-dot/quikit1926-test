import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Landing from "@/components/landing/Landing";

// Public first-contact page. Signed-in users skip straight to the app.
export default async function RootPage() {
  const session = await auth();
  if (session?.user) redirect("/overview");
  return <Landing />;
}
