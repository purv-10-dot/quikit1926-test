"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { SessionGuard } from "@/components/session-guard";
import { IssueCreatedToast } from "@/components/issue-created-toast";
import { ThemeApplier } from "@quikit/ui/theme-applier";
import { ImpersonationBanner } from "@quikit/ui";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const pathname = usePathname();
  const isSettings = /^\/spaces\/[^/]+\/settings/.test(pathname ?? "");

  return (
    <SessionGuard>
      <ThemeApplier />
      <ImpersonationBanner />
      <div className="flex flex-col h-screen bg-white">
        <Header onToggleSidebar={() => setSidebarVisible((v) => !v)} />
        <div className="flex flex-1 overflow-hidden">
          {sidebarVisible && !isSettings && <Sidebar />}
          <main className="flex-1 overflow-y-auto bg-white">{children}</main>
        </div>
        <IssueCreatedToast />
      </div>
    </SessionGuard>
  );
}
