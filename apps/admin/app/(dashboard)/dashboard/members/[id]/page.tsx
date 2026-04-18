"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button, Select, useConfirm } from "@quikit/ui";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate, formatRelativeDate } from "@/lib/utils";
import { ArrowLeft, Loader2, Mail, UserX, Send } from "lucide-react";

interface MemberDetail {
  membershipId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  role: string;
  status: string;
  customPermissions: string[];
  invitedAt: string | null;
  acceptedAt: string | null;
  lastSignInAt: string | null;
  userCreatedAt: string;
  teams: { id: string; name: string; color: string | null }[];
  apps: { id: string; name: string; slug: string; iconUrl: string | null; role: string }[];
}

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [role, setRole] = useState("");

  async function fetchMember() {
    const res = await fetch(`/api/members/${params.id}`);
    const json = await res.json();
    if (json.success) {
      setMember(json.data);
      setRole(json.data.role);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchMember();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleUpdateRole() {
    setUpdating(true);
    await fetch(`/api/members/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await fetchMember();
    setUpdating(false);
  }

  async function handleDeactivate() {
    if (!(await confirm({ title: "Deactivate this member?", description: "They will lose access to the organization immediately. You can reactivate them later.", confirmLabel: "Deactivate", tone: "danger" }))) return;
    setUpdating(true);
    await fetch(`/api/members/${params.id}`, { method: "DELETE" });
    router.push("/dashboard/members");
  }

  async function handleResendInvite() {
    setUpdating(true);
    await fetch(`/api/members/${params.id}/resend-invite`, { method: "POST" });
    setUpdating(false);
    alert("Invitation resent!");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  if (!member) {
    return <p className="text-[var(--color-text-secondary)]">Member not found</p>;
  }

  return (
    <div>
      <button
        onClick={() => router.push("/dashboard/members")}
        className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Members
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile card */}
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <Avatar
              src={member.avatar}
              firstName={member.firstName}
              lastName={member.lastName}
              size="lg"
            />
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mt-3">
              {member.firstName} {member.lastName}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">{member.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={member.role}>
                {ROLE_LABELS[member.role] || member.role}
              </Badge>
              <Badge variant={member.status}>{member.status}</Badge>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-tertiary)]">Joined</span>
              <span className="text-[var(--color-text-primary)]">
                {member.acceptedAt ? formatDate(member.acceptedAt) : "Pending"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-tertiary)]">Last Active</span>
              <span className="text-[var(--color-text-primary)]">
                {member.lastSignInAt ? formatRelativeDate(member.lastSignInAt) : "Never"}
              </span>
            </div>
            {member.invitedAt && (
              <div className="flex justify-between">
                <span className="text-[var(--color-text-tertiary)]">Invited</span>
                <span className="text-[var(--color-text-primary)]">
                  {formatDate(member.invitedAt)}
                </span>
              </div>
            )}
          </div>

          <div className="mt-6 space-y-2">
            {member.status === "invited" && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleResendInvite}
                disabled={updating}
              >
                <Send className="h-4 w-4" /> Resend Invitation
              </Button>
            )}
            {member.status === "active" && (
              <Button
                variant="danger"
                size="sm"
                className="w-full"
                onClick={handleDeactivate}
                disabled={updating}
              >
                <UserX className="h-4 w-4" /> Deactivate Member
              </Button>
            )}
          </div>
        </Card>

        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Role */}
          <Card>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Role</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  options={[
                    { value: "employee", label: "Employee" },
                    { value: "coach", label: "Coach" },
                    { value: "manager", label: "Manager" },
                    { value: "executive", label: "Executive" },
                    { value: "admin", label: "Admin" },
                    { value: "super_admin", label: "Super Admin" },
                  ]}
                />
              </div>
              <Button
                size="sm"
                onClick={handleUpdateRole}
                disabled={role === member.role || updating}
                loading={updating}
              >
                Update
              </Button>
            </div>
          </Card>

          {/* Teams */}
          <Card>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Teams</h3>
            {member.teams.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {member.teams.map((team) => (
                  <span
                    key={team.id}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-[var(--color-neutral-100)] text-[var(--color-text-secondary)]"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: team.color || "#6366f1" }}
                    />
                    {team.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-tertiary)]">Not assigned to any teams</p>
            )}
          </Card>

          {/* App Access */}
          <Card>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">App Access</h3>
            {member.apps.length > 0 ? (
              <div className="space-y-2">
                {member.apps.map((app) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2"
                  >
                    <span className="text-sm text-[var(--color-text-primary)]">{app.name}</span>
                    <Badge>{app.role}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-tertiary)]">No app access granted</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
