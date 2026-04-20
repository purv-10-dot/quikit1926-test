"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { AppSwitcher, UserMenu, globalSignOut } from "@quikit/ui";

export function Header() {
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
    await updateSession({ tenantId: null });
    router.push("/select-org");
  }

  return (
    <header className="h-16 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        <AppSwitcher />
        <UserMenu
          user={{ name: fullName, email }}
          isImpersonating={isImpersonating}
          onSignOut={handleSignOut}
          onExitImpersonation={handleExitImpersonation}
          items={[
            { label: "Switch Organisation", icon: ArrowLeftRight, onClick: handleSwitchOrg },
          ]}
          avatarClassName="bg-accent-600"
        />
      </div>
    </header>
  );
}
