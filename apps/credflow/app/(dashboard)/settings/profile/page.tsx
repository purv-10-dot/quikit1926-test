import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileEditForm } from "@/components/settings/profile-edit-form";
import { SettingsReturnBackButton } from "@/components/settings/settings-return-back";

export default async function MyProfilePage() {
  const session = await requireUser();
  const [user, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { firstName: true, lastName: true, email: true },
    }),
    prisma.orgMember.findUnique({
      where: {
        orgId_userId: { orgId: session.orgId, userId: session.userId },
      },
      select: { role: true, status: true },
    }),
  ]);
  if (!user) return null;
  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "U";

  return (
    <div className="space-y-5">
      <SettingsReturnBackButton />
      <PageHeader
        title="My Profile"
        subtitle="Update personal details and review account access."
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-crm-border bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100 text-base font-semibold text-accent-700">
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-crm-text">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-crm-muted">{user.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-crm-panel px-2.5 py-1 font-medium text-crm-text">
              {membership?.role ?? session.role}
            </span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700">
              {membership?.status ?? "Active"}
            </span>
          </div>
        </div>

        <CardBody>
          <ProfileEditForm
            initial={{
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              phone: null,
            }}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Summary</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Detail k="Role" v={membership?.role ?? session.role} />
            <Detail k="Status" v={membership?.status ?? "—"} />
            <Detail k="Tenant" v={session.orgId} />
            <Detail k="User ID" v={session.userId} mono />
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

function Detail({ k, v, mono }: { k: string; v?: string | null; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-crm-border bg-slate-50/60 px-3 py-2.5">
      <dt className="text-xs uppercase tracking-wider text-crm-muted">{k}</dt>
      <dd className={`mt-0.5 text-crm-text ${mono ? "font-mono text-xs" : ""}`}>{v || "—"}</dd>
    </div>
  );
}
