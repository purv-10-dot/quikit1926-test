"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import FabChat from "./FabChat";
import Toast from "@/components/ui/Toast";
import ProductAssistant from "@/components/ui/ProductAssistant";

// Routes that render standalone (no sidebar/topbar chrome).
const BARE_ROUTES = new Set(["/", "/login"]);
// Prefix — every page under /legal (hub, privacy, terms, and any future
// addition) is public and must not show the authenticated app shell, same
// reasoning as middleware.ts's publicRoutes "/legal" entry.
const BARE_PREFIXES = ["/legal"];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (BARE_ROUTES.has(pathname) || BARE_PREFIXES.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  return (
    <div className="app">
      <Topbar />
      <div className="body-row">
        <Sidebar />
        <div className="main">{children}</div>
      </div>
      <FabChat />
      <Toast />
      <ProductAssistant />
    </div>
  );
}
