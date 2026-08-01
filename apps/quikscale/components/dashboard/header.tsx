"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Menu, Settings, Building2 } from "lucide-react";
import { AppSwitcher, UserMenu, globalSignOut } from "@quikit/ui";
import { useOrgInfo } from "@/lib/hooks/useOrgInfo";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { org } = useOrgInfo();

  const fullName = session?.user?.name || session?.user?.email?.split("@")[0] || "User";
  const email = session?.user?.email || "";
  const isImpersonating = session?.user?.impersonating === true;

  async function handleSignOut() {
    // After full sign-out (local + auth + launcher cookies cleared), land
    // the user back on quikscale's public landing page so they see "Login"
    // again instead of an authenticated /apps tile grid.
    const landingUrl =
      (process.env.NEXT_PUBLIC_QUIKSCALE_URL?.replace(/\/+$/, "") ??
        (typeof window !== "undefined" ? window.location.origin : "")) + "/";
    await globalSignOut({
      authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
      quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
      localSignOut: () => signOut({ redirect: false }),
      postLogoutRedirect: landingUrl,
    });
  }

  async function handleExitImpersonation() {
    try {
      const r = await fetch("/api/auth/impersonate/exit", { method: "POST" });
      const j = await r.json();
      const redirect = j?.data?.redirectUrl || "/";
      window.location.href = redirect;
    } catch {
      window.location.href = "/";
    }
  }

  function handleSettings() {
    router.push("/settings");
  }

  return (
    <header className="relative z-[100] bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      {/* Left — mobile menu + welcome + active-org chip */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded-md hover:bg-gray-100 text-gray-600"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-gray-900">
          Welcome, {fullName.split(" ")[0]}!
        </h1>
        {/* Active-org chip — shows the user's currently-selected org so
            multi-org members always know which tenant they're viewing.
            Hidden on very small screens to keep the header from wrapping. */}
        {org?.name && (
          <span
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-accent-50 text-accent-700 rounded-full border border-accent-100 whitespace-nowrap max-w-[220px]"
            title={org.name}
          >
            <Building2 className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{org.name}</span>
          </span>
        )}
      </div>

      {/* Right — app switcher + shared user menu.
          Support lives in the floating launcher (components/support/
          support-launcher.tsx), mounted globally in dashboard-shell. */}
      <div className="flex items-center gap-2">
        <AppSwitcher />
        <UserMenu
          user={{ name: fullName, email }}
          isImpersonating={isImpersonating}
          onSignOut={handleSignOut}
          onExitImpersonation={handleExitImpersonation}
          items={[
            { label: "Settings", icon: Settings, onClick: handleSettings },
          ]}
          avatarClassName="bg-accent-600"
        />
      </div>
    </header>
  );
}
