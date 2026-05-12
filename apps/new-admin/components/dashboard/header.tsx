"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { AppSwitcher, UserMenu, globalSignOut } from "@quikit/ui";

/**
 * Header — mirrors apps/admin/components/dashboard/header.tsx.
 * Uses the real @quikit/ui AppSwitcher + UserMenu with globalSignOut so the
 * QuikIT IdP session is terminated alongside the local session.
 */
export default function Header() {
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

  async function handleSwitchOrg() {
    await updateSession({ orgId: null });
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
          items={[
            { label: "Switch Organisation", icon: ArrowLeftRight, onClick: handleSwitchOrg },
          ]}
          avatarClassName="bg-[var(--color-secondary)]"
        />
      </div>
    </header>
  );
}
