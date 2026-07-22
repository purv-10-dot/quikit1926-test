import { redirect } from "next/navigation";

// The Celebrations calendar has been merged into the unified HR Calendar.
// Any old link/bookmark lands on the single calendar page.
export default function CelebrationsRedirect() {
  redirect("/holidays");
}
