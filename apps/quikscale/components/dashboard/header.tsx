"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Menu, Settings, Building2 } from "lucide-react";
import { AppSwitcher, UserMenu, globalSignOut } from "@quikit/ui";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();

  const fullName = session?.user?.name || session?.user?.email?.split("@")[0] || "User";
  const email = session?.user?.email || "";
  const isImpersonating = session?.user?.impersonating === true;

  async function handleSignOut() {
    await globalSignOut({
      quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
      localSignOut: () => signOut({ redirect: false }),
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

  async function handleSwitchOrg() {
    await updateSession({ tenantId: null, membershipRole: null });
    router.push("/select-org");
  }

  function handleSettings() {
    router.push("/settings");
  }

  return (
    <header className="relative z-[100] bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      {/* Left — mobile menu + welcome */}
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
      </div>

      {/* Right — app switcher + shared user menu */}
      <div className="flex items-center gap-2">
        <AppSwitcher />
        <UserMenu
          user={{ name: fullName, email }}
          isImpersonating={isImpersonating}
          onSignOut={handleSignOut}
          onExitImpersonation={handleExitImpersonation}
          items={[
            { label: "Switch Organisation", icon: Building2, onClick: handleSwitchOrg },
            { label: "Settings", icon: Settings, onClick: handleSettings },
          ]}
          avatarClassName="bg-accent-600"
        />
      </div>
    </header>
  );
}
