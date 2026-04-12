import { redirect } from "next/navigation";

/**
 * /select-org now redirects to /apps.
 * The app launcher includes the org selector inline.
 */
export default function SelectOrgPage() {
  redirect("/apps");
}
