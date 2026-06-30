import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PortalShell({
  title,
  description,
  actions,
  children
}: {
  title: string;
  description: string;
  actions?: { label: string; href: string; external?: boolean }[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border bg-background p-6 shadow-soft">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">QuikFinance Portal</p>
              <h1 className="mt-2 text-3xl font-bold">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
            </div>
            {actions?.length ? (
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    target={action.external ? "_blank" : undefined}
                    className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
