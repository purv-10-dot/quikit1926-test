"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, ChevronDown, Moon, Sun, LogOut, Building2, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PORTALS } from "@/lib/portal/nav";
import { ROLE_LABELS } from "@/lib/portal/rbac";
import type { PortalKey } from "@/lib/portal/hosts";
import { PortalAiCopilot } from "./PortalAiCopilot";
import { NotificationBell } from "./NotificationBell";

export type PortalSessionView = {
  portal: PortalKey;
  role: string;
  orgId: string;
  companies: { orgId: string; name: string; role: string }[];
};

export function PortalShell({ session, children }: { session: PortalSessionView; children: React.ReactNode }) {
  const meta = PORTALS[session.portal];
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 -translate-x-full border-r bg-card transition-transform lg:static lg:translate-x-0",
        mobileOpen && "translate-x-0"
      )}>
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white", meta.accent)}>Q</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{meta.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{meta.tagline}</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex flex-col gap-5 overflow-y-auto px-3 py-4">
          {meta.nav.map((group) => (
            <div key={group.title}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                      className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition", active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                      <item.icon className="h-4 w-4 shrink-0" />{item.title}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <PortalTopbar session={session} onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-5 md:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      <PortalAiCopilot portal={session.portal} />
    </div>
  );
}

function PortalTopbar({ session, onMenu }: { session: PortalSessionView; onMenu: () => void }) {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const current = session.companies.find((c) => c.orgId === session.orgId) ?? session.companies[0];

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const switchCompany = async (orgId: string) => {
    document.cookie = `qf_portal_company_${session.portal}=${orgId}; path=/; max-age=31536000`;
    setCompanyOpen(false);
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur md:px-6">
      <button className="lg:hidden" onClick={onMenu} aria-label="Menu"><Menu className="h-5 w-5" /></button>

      {/* Company switcher (multi-company, mainly CA) */}
      {session.companies.length > 0 && (
        <div className="relative">
          <button onClick={() => setCompanyOpen((o) => !o)} disabled={session.companies.length < 2}
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium disabled:opacity-80">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="max-w-[160px] truncate">{current?.name}</span>
            {session.companies.length > 1 && <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {companyOpen && session.companies.length > 1 && (
            <div className="absolute left-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border bg-popover shadow-popover">
              <p className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Switch company</p>
              {session.companies.map((c) => (
                <button key={c.orgId} onClick={() => switchCompany(c.orgId)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                  <span className="truncate">{c.name}</span>
                  {c.orgId === session.orgId && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        <span className="hidden rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline">{ROLE_LABELS[session.role] ?? session.role}</span>
        <NotificationBell portal={session.portal} />
        <button onClick={toggleTheme} className="rounded-lg p-2 hover:bg-muted" aria-label="Toggle theme">{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
        <Link href="/login" className="rounded-lg p-2 hover:bg-muted" aria-label="Sign out"><LogOut className="h-5 w-5" /></Link>
      </div>
    </header>
  );
}
