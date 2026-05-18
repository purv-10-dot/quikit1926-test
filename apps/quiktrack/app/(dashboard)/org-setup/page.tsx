import { redirect } from "next/navigation";

export default function OrgSetupIndex() {
  redirect("/org-setup/users");
}
