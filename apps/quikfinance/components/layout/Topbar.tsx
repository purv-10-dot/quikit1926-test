"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Bell, Globe2, LogOut, Sparkles, Plus, Search, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { Button } from "@/components/ui/button";
import { OPEN_COMMAND_EVENT } from "@/components/layout/CommandPalette";
import { signOut } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { useAiDock } from "@/lib/stores/ai-dock";

function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_EVENT));
}

export function Topbar() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const openDock = useAiDock((s) => s.openDock);

  const company = useQuery({
    queryKey: ["company-summary"],
    queryFn: async () => {
      const response = await fetch("/api/v1/settings/company");
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as {
        data?: { name?: string; base_currency?: string; preferred_language?: "en" | "hi" };
      };
      return payload.data ?? null;
    }
  });

  const logout = async () => {
    await signOut({ redirect: false });
    toast.success(t("topbar.signedOut", "Signed out."));
    router.push("/login");
  };

  const changeLanguage = async (nextLocale: "en" | "hi") => {
    setLocale(nextLocale);
    await fetch("/api/v1/settings/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferred_language: nextLocale })
    }).catch(() => null);
  };

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <MobileSidebar />
        <div className="hidden md:block">
          <p className="text-sm font-semibold">{company.data?.name ?? t("topbar.companyFallback", "QuikFinance Workspace")}</p>
          <p className="text-xs text-muted-foreground">
            {t("topbar.fiscalYear", "Fiscal year {year} · {currency}", {
              year: new Date().getFullYear(),
              currency: company.data?.base_currency ?? "INR"
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={openCommandPalette}
          className="ml-auto hidden h-9 w-full max-w-md items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:flex"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">{t("topbar.placeholder", "Search or jump to anything…")}</span>
          <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
        </button>
        <Button onClick={openCommandPalette} className="hidden sm:inline-flex" aria-label="Quick create">
          <Plus className="mr-1 h-4 w-4" />New
        </Button>
        <Button variant="ghost" className="ml-auto md:hidden" aria-label="Search" onClick={openCommandPalette}>
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" className="hidden md:inline-flex" aria-label="Ask AI" onClick={() => openDock()}>
          <Sparkles className="h-4 w-4 text-indigo-500" />
        </Button>
        <Button asChild variant="ghost" aria-label={t("topbar.settings", "Settings")}>
          <Link href="/settings"><Settings className="h-4 w-4" /></Link>
        </Button>
        <Button variant="ghost" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="secondary" aria-label="User menu">
              <UserRound className="mr-2 h-4 w-4" />
              Owner
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" className="z-50 min-w-44 rounded-lg border bg-card p-1 shadow-soft">
            <DropdownMenu.Item className="rounded-md px-3 py-2 text-sm outline-none hover:bg-muted">{t("topbar.profile", "Profile")}</DropdownMenu.Item>
            <DropdownMenu.Item onClick={() => router.push("/settings")} className="cursor-pointer rounded-md px-3 py-2 text-sm outline-none hover:bg-muted">{t("topbar.settings", "Settings")}</DropdownMenu.Item>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="flex w-full items-center rounded-md px-3 py-2 text-sm outline-none hover:bg-muted">
                <Globe2 className="mr-2 h-4 w-4" />
                {t("common.language", "Language")}
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className="z-50 min-w-40 rounded-lg border bg-card p-1 shadow-soft">
                  <DropdownMenu.Item onClick={() => changeLanguage("en")} className="rounded-md px-3 py-2 text-sm outline-none hover:bg-muted">
                    {locale === "en" ? "• " : ""}{t("common.english", "English")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onClick={() => changeLanguage("hi")} className="rounded-md px-3 py-2 text-sm outline-none hover:bg-muted">
                    {locale === "hi" ? "• " : ""}{t("common.hindi", "Hindi")}
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item onClick={logout} className="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm outline-none hover:bg-muted">
              <LogOut className="mr-2 h-4 w-4" />
              {t("topbar.signOut", "Sign out")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
