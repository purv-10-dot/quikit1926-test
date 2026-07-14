import { redirect } from "next/navigation";

// The standalone User Directory has been merged into Settings → User Management.
// This route now redirects there. The employee-directory API (/api/users) stays
// in place for bulk import and the asset-assignment pickers.
export default function UsersPage() {
  redirect("/settings/user-management");
}
