"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AccountPicker } from "@/components/settings/account-picker";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  permissionTemplates: { template: { id: string; name: string } }[];
  allowedAccounts: { accountId: string }[];
}
interface Template {
  id: string;
  name: string;
}

const ROLES = ["Administrator", "SalesManager", "SalesUser", "MarketingUser", "FinanceUser"];

export default function EditUserPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const toast = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("SalesUser");
  const [status, setStatus] = useState("Active");
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [allowedAccountIds, setAllowedAccountIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/settings/users/${id}`, { credentials: "include" }).then((r) => r.json()),
      fetch("/api/settings/permission-templates", { credentials: "include" }).then((r) => r.json()),
    ]).then(([u, t]) => {
      const usr = u as User;
      setUser(usr);
      setTemplates(Array.isArray(t?.items) ? t.items : []);
      setFirst(usr.firstName);
      setLast(usr.lastName);
      setEmail(usr.email);
      setPhone(usr.phone ?? "");
      setRole(usr.role);
      setStatus(usr.status);
      setTemplateIds(usr.permissionTemplates.map((p) => p.template.id));
      setAllowedAccountIds(usr.allowedAccounts.map((a) => a.accountId));
    });
  }, [id]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/users/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: first,
          lastName: last,
          email,
          phone: phone || null,
          role,
          status,
          permissionTemplateIds: templateIds,
          allowedAccountIds,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      toast.success("User updated");
      router.push("/settings/users");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <p className="text-sm text-crm-muted">Loading…</p>;

  return (
    <div>
      <Link href="/settings/users" className="mb-3 inline-flex items-center gap-1 text-sm text-crm-blue hover:underline">
        <ChevronLeft size={14} /> All users
      </Link>
      <h1 className="mb-4 text-xl font-semibold text-crm-text">
        {user.firstName} {user.lastName}
      </h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-3 text-sm">
            <Field label="First name">
              <Input value={first} onChange={(e) => setFirst(e.target.value)} />
            </Field>
            <Field label="Last name">
              <Input value={last} onChange={(e) => setLast(e.target.value)} />
            </Field>
            <Field label="Email" full>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Phone" full>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permission templates</CardTitle>
          </CardHeader>
          <CardBody>
            {templates.length === 0 ? (
              <p className="text-sm text-crm-muted">
                No templates yet. <Link href="/settings/permissions" className="crm-link">Create one</Link>.
              </p>
            ) : (
              <ul className="space-y-1">
                {templates.map((t) => (
                  <li key={t.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={templateIds.includes(t.id)}
                        onChange={(e) =>
                          setTemplateIds((cur) =>
                            e.target.checked ? [...cur, t.id] : cur.filter((x) => x !== t.id),
                          )
                        }
                      />
                      {t.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Account access (ACL)</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-2 text-xs text-crm-muted">
              Leave empty to allow visibility into all accounts (subject to sales-group ACL). Add specific accounts to
              restrict visibility.
            </p>
            <AccountPicker value={allowedAccountIds} onChange={setAllowedAccountIds} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.push("/settings/users")}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={"block text-sm " + (full ? "col-span-2" : "")}>
      <span className="mb-1 block font-medium text-crm-text">{label}</span>
      {children}
    </label>
  );
}
