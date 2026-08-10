"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { KanTour } from "@/components/tour/kan-tour";
import { SessionGuard } from "@/components/session-guard";
import { IssueCreatedToast } from "@/components/issue-created-toast";
import { ToastHost } from "@/components/toast-host";
import { ConfirmHost } from "@/components/confirm-host";
import { NoAccessGate } from "@/components/shell/no-access-gate";
import { ThemeSync } from "@/components/shell/theme-sync";
import { ImpersonationBanner } from "@quikit/ui";

/**
 * Client shell for the dashboard. The server `layout.tsx` performs the
 * app-access gate BEFORE rendering this, so a user without QuikTrack access
 * never sees any of the chrome below — not even for a frame. SessionGuard stays
 * as the live-revalidation backstop (access revoked while already inside).
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const pathname = usePathname();
  const isSettings =
    /^\/spaces\/[^/]+\/settings/.test(pathname ?? "") ||
    /^\/settings(\/|$)/.test(pathname ?? "");

  // Pages (like the project header's fullscreen button) dispatch this event
  // to hide both the top header and the sidebar for a distraction-free view.
  useEffect(() => {
    function onFs(e: Event) {
      const detail = (e as CustomEvent<{ on?: boolean }>).detail;
      setFullscreen((prev) => (typeof detail?.on === "boolean" ? detail.on : !prev));
    }
    window.addEventListener("qt:fullscreen", onFs as EventListener);
    return () => window.removeEventListener("qt:fullscreen", onFs as EventListener);
  }, []);

  // Reset on route change so navigating to another page restores the chrome.
  useEffect(() => {
    setFullscreen(false);
  }, [pathname]);

  return (
    <SessionGuard>
      <ThemeSync />
      <ImpersonationBanner />
      <NoAccessGate>
        <div className="flex flex-col h-screen bg-white">
          {!fullscreen && (
            <Header
              onToggleSidebar={() => setSidebarVisible((v) => !v)}
              sidebarOpen={sidebarVisible && !isSettings}
            />
          )}
          <div className="flex flex-1 overflow-hidden">
            {!fullscreen && sidebarVisible && !isSettings && <Sidebar />}
            {/* `overscroll-contain`: the shell is the last scroll container —
                a page that runs long scrolls here and stops, instead of
                chaining the leftover wheel delta to the document and dragging
                the sticky header / sidebar out of view. */}
            <main className="flex-1 overflow-y-auto overscroll-contain bg-white">
              {children}
            </main>
          </div>
          <IssueCreatedToast />
          <ToastHost />
          <ConfirmHost />
          <KanTour />
        </div>
      </NoAccessGate>
    </SessionGuard>
  );
}
