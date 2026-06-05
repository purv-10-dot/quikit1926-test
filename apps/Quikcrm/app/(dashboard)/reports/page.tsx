import { redirect } from "next/navigation";

/** Default Reports landing → executive overview (CRM-style home). */
export default function ReportsIndexPage() {
  redirect("/reports/overview");
}
