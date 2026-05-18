import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_HIERARCHY } from "@quikit/shared";
import { OrgSetupTabs } from "./_components/org-setup-tabs";

export default async function OrgSetupLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const orgId = session.user.orgId;
  if (!orgId) redirect("/select-org");

  const membership = await db.orgMember.findFirst({
    where: { userId: session.user.id, orgId, status: "active" },
    select: { role: true },
  });
  const level = ROLE_HIERARCHY[membership?.role ?? ""] ?? 0;
  if (level < ROLE_HIERARCHY["admin"]) redirect("/");

  return (
    <div className="min-h-full">
      <div className="border-b border-gray-200 bg-white">
        <div className="px-6 pt-6">
          <h1 className="text-xl font-semibold text-gray-900">Org Setup</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage users, roles, and permissions for this organisation.
          </p>
          <OrgSetupTabs />
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
    </div>
  );
}
