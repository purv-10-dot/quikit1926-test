"use client";

import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { SessionGuard } from "@/components/session-guard";
import { FeatureDisabledToast } from "@quikit/ui";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();

  return (
    <SessionGuard>
      <div className="min-h-screen bg-[var(--color-bg-secondary)]">
        <Sidebar orgName={session?.user?.name} />
        <div className="ml-60">
          <Header />
          <main className="p-6">{children}</main>
        </div>
        <FeatureDisabledToast />
      </div>
    </SessionGuard>
  );
}
