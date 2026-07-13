"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/shared/DataTable";
import { useI18n } from "@/lib/i18n";

type CustomerRow = {
  id: string;
  display_name: string;
  email: string | null;
};

type PortalLinkRow = {
  id: string;
  portal_type: string;
  display_name: string | null;
  email: string | null;
  expires_at: string | null;
  is_active: boolean;
  access_url: string;
};

export function PortalManager() {
  const { t } = useI18n();
  const [customerId, setCustomerId] = useState("");
  const [caEmail, setCaEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("30");

  const customers = useQuery({
    queryKey: ["portal-customers"],
    queryFn: async () => {
      const response = await fetch("/api/v1/customers?per_page=100");
      const payload = (await response.json()) as { data?: CustomerRow[] };
      return payload.data ?? [];
    }
  });

  const portals = useQuery({
    queryKey: ["portals"],
    queryFn: async () => {
      const response = await fetch("/api/v1/portals");
      if (!response.ok) {
        throw new Error("Portal links could not be loaded.");
      }
      const payload = (await response.json()) as { data?: PortalLinkRow[] };
      return payload.data ?? [];
    }
  });

  const customerOptions = useMemo(() => customers.data ?? [], [customers.data]);

  const createPortal = async (portalType: "customer" | "ca") => {
    const response = await fetch("/api/v1/portals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portal_type: portalType,
        contact_id: portalType === "customer" ? customerId : undefined,
        email: portalType === "ca" ? caEmail : undefined,
        display_name: displayName || undefined,
        expires_in_days: Number(expiresInDays)
      })
    });

    const payload = (await response.json()) as { data?: PortalLinkRow; error?: { message?: string } };
    if (!response.ok) {
      toast.error(payload.error?.message ?? "Portal link could not be created.");
      return;
    }

    toast.success(t("portals.createLink", "Create portal link"));
    portals.refetch();

    if (payload.data?.access_url) {
      await navigator.clipboard.writeText(payload.data.access_url);
      toast.success(t("portals.copied", "Copied to clipboard."));
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("portals.customerPortal", "Customer portal")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="portal-customer">{t("portals.contactLabel", "Customer")}</Label>
              <select
                id="portal-customer"
                className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                <option value="">{t("common.search", "Search")}...</option>
                {customerOptions.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="portal-display-name">{t("portals.displayName", "Display name")}</Label>
              <Input id="portal-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="portal-expiry">{t("portals.expiresInDays", "Expires in days")}</Label>
              <Input id="portal-expiry" type="number" min="1" max="365" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} />
            </div>
            <Button onClick={() => createPortal("customer")} disabled={!customerId}>
              {t("portals.createLink", "Create portal link")}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("portals.caPortal", "CA portal")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="portal-ca-email">{t("portals.caEmail", "CA email")}</Label>
              <Input id="portal-ca-email" type="email" value={caEmail} onChange={(event) => setCaEmail(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="portal-ca-name">{t("portals.displayName", "Display name")}</Label>
              <Input id="portal-ca-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="portal-ca-expiry">{t("portals.expiresInDays", "Expires in days")}</Label>
              <Input id="portal-ca-expiry" type="number" min="1" max="365" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} />
            </div>
            <Button onClick={() => createPortal("ca")} disabled={!caEmail}>
              {t("portals.createLink", "Create portal link")}
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("portals.activeLinks", "Active links")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            title={t("portals.activeLinks", "Active links")}
            rows={(portals.data ?? []).map((portal) => ({
              id: portal.id,
              portal_type: portal.portal_type,
              display_name: portal.display_name ?? "-",
              email: portal.email ?? "-",
              expires_at: portal.expires_at ?? "-",
              access_url: portal.access_url
            }))}
            columns={[
              { key: "portal_type", label: "Type" },
              { key: "display_name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "expires_at", label: "Expires" },
              { key: "access_url", label: "Link" }
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
