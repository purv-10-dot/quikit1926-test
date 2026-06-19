import { redirect } from "next/navigation";

// Work items settings currently has a single section — Fields.
export default function WorkItemsPage() {
  redirect("/settings/work-items/fields");
}
