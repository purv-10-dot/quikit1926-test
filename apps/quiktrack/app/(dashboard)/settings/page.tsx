import { redirect } from "next/navigation";

export default function SettingsIndex() {
  redirect("/settings/user-management");
}
