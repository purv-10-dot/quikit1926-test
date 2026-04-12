"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { LogOut, ArrowLeftRight } from "lucide-react";
import { Button, AppSwitcher } from "@quikit/ui";

export function Header() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();

  async function handleSwitchOrg() {
    await updateSession({ tenantId: null });
    router.push("/select-org");
  }

  return (
    <header className="h-16 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        <AppSwitcher
          quikitUrl={process.env.NEXT_PUBLIC_QUIKIT_URL || "http://localhost:3000"}
          currentAppSlug="admin"
        />
        <Button variant="ghost" size="sm" onClick={handleSwitchOrg}>
          <ArrowLeftRight className="h-4 w-4" />
          Switch Org
        </Button>
        <div className="flex items-center gap-2">
          <Avatar
            firstName={session?.user?.name?.split(" ")[0]}
            lastName={session?.user?.name?.split(" ")[1]}
            size="sm"
          />
          <span className="text-sm text-[var(--color-text-secondary)]">
            {session?.user?.name}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
