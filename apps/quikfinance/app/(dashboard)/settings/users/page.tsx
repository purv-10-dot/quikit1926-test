import { DataTable } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";

const users = [
  { id: "user-1", name: "Owner", email: "owner@example.com", role: "owner", status: "active" },
  { id: "user-2", name: "Priya Shah", email: "priya@example.com", role: "accountant", status: "active" },
  { id: "user-3", name: "Sam Lee", email: "sam@example.com", role: "viewer", status: "invited" }
];

export default function UsersSettingsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Users" description="Invite teammates, assign roles, and control organization access." actionLabel="Invite user" actionHref="/settings/users" />
      <DataTable
        title="Users"
        rows={users}
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "role", label: "Role", kind: "status" },
          { key: "status", label: "Status", kind: "status" }
        ]}
      />
    </div>
  );
}
