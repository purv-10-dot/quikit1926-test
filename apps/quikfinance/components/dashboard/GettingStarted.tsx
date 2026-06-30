"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

type OnboardingStatus = {
  company: boolean;
  customers: number;
  invoices: number;
  vendors: number;
  bills: number;
  items: number;
  banks: number;
};

const EMPTY_STATUS: OnboardingStatus = {
  company: false,
  customers: 0,
  invoices: 0,
  vendors: 0,
  bills: 0,
  items: 0,
  banks: 0
};

async function fetchTotal(path: string): Promise<number> {
  try {
    const response = await fetch(path);
    if (!response.ok) return 0;
    const payload = (await response.json()) as { meta?: { total?: number }; data?: unknown };
    if (typeof payload?.meta?.total === "number") return payload.meta.total;
    return Array.isArray(payload?.data) ? payload.data.length : 0;
  } catch {
    return 0;
  }
}

async function fetchCompanyConfigured(): Promise<boolean> {
  try {
    const response = await fetch("/api/v1/settings/company");
    if (!response.ok) return false;
    const payload = (await response.json()) as { data?: { gstin?: string | null; tax_id?: string | null } };
    return Boolean(payload?.data?.gstin || payload?.data?.tax_id);
  } catch {
    return false;
  }
}

export function GettingStarted() {
  const { t } = useI18n();

  const { data: status } = useQuery<OnboardingStatus>({
    queryKey: ["getting-started"],
    queryFn: async () => {
      const [company, customers, invoices, vendors, bills, items, banks] = await Promise.all([
        fetchCompanyConfigured(),
        fetchTotal("/api/v1/customers"),
        fetchTotal("/api/v1/invoices"),
        fetchTotal("/api/v1/vendors"),
        fetchTotal("/api/v1/bills"),
        fetchTotal("/api/v1/inventory"),
        fetchTotal("/api/v1/bank-accounts")
      ]);
      return { company, customers, invoices, vendors, bills, items, banks };
    },
    initialData: EMPTY_STATUS,
    refetchOnWindowFocus: true
  });

  const steps = [
    {
      key: "company",
      title: t("gettingStarted.company.title", "Complete your company profile"),
      description: t("gettingStarted.company.desc", "Add your GSTIN, PAN, address, and base currency so documents are compliant."),
      href: "/settings",
      cta: t("gettingStarted.company.cta", "Open settings"),
      done: status.company
    },
    {
      key: "customer",
      title: t("gettingStarted.customer.title", "Add your first customer"),
      description: t("gettingStarted.customer.desc", "Create a customer you can invoice and track receivables for."),
      href: "/customers/new",
      cta: t("gettingStarted.customer.cta", "Add customer"),
      done: status.customers > 0
    },
    {
      key: "invoice",
      title: t("gettingStarted.invoice.title", "Send your first invoice"),
      description: t("gettingStarted.invoice.desc", "Raise a GST invoice and share a payment link with your customer."),
      href: "/invoices/new",
      cta: t("gettingStarted.invoice.cta", "Create invoice"),
      done: status.invoices > 0
    },
    {
      key: "vendor",
      title: t("gettingStarted.vendor.title", "Add a vendor"),
      description: t("gettingStarted.vendor.desc", "Record the suppliers you buy from to manage bills and payables."),
      href: "/vendors/new",
      cta: t("gettingStarted.vendor.cta", "Add vendor"),
      done: status.vendors > 0
    },
    {
      key: "bill",
      title: t("gettingStarted.bill.title", "Record a bill"),
      description: t("gettingStarted.bill.desc", "Enter a vendor bill to start tracking what you owe."),
      href: "/bills/new",
      cta: t("gettingStarted.bill.cta", "New bill"),
      done: status.bills > 0
    },
    {
      key: "item",
      title: t("gettingStarted.item.title", "Add an inventory item"),
      description: t("gettingStarted.item.desc", "Set up the products or services you sell, with HSN/SAC and tax rates."),
      href: "/inventory",
      cta: t("gettingStarted.item.cta", "Add item"),
      done: status.items > 0
    },
    {
      key: "bank",
      title: t("gettingStarted.bank.title", "Connect a bank account"),
      description: t("gettingStarted.bank.desc", "Add a bank account to reconcile transactions and track cash flow."),
      href: "/bank-accounts",
      cta: t("gettingStarted.bank.cta", "Add bank account"),
      done: status.banks > 0
    }
  ];

  const completed = steps.filter((step) => step.done).length;
  const total = steps.length;
  const percent = Math.round((completed / total) * 100);
  const allDone = completed === total;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {allDone
              ? t("gettingStarted.allDoneTitle", "You're all set up 🎉")
              : t("gettingStarted.progressTitle", "Set up your workspace")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t("gettingStarted.progress", "{completed} of {total} steps complete", { completed, total })}
            </span>
            <span className="font-semibold tabular-nums">{percent}%</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("gettingStarted.progressLabel", "Onboarding progress")}
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
        </CardContent>
      </Card>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.key}>
            <div
              className={cn(
                "flex flex-col gap-3 rounded-lg border bg-card p-4 transition sm:flex-row sm:items-center sm:justify-between",
                step.done ? "border-primary/30 bg-primary/5" : "hover:border-primary/40"
              )}
            >
              <div className="flex items-start gap-3">
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div>
                  <p className={cn("font-semibold", step.done && "text-muted-foreground line-through")}>
                    <span className="mr-1 text-muted-foreground">{index + 1}.</span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
              <div className="shrink-0 pl-8 sm:pl-0">
                <Button asChild variant={step.done ? "secondary" : "primary"} size="sm">
                  <Link href={step.href}>
                    {step.done ? t("gettingStarted.review", "Review") : step.cta}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
