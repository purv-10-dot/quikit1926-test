import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { Topbar } from "@/components/layout/Topbar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { AiDock } from "@/components/layout/AiDock";
import { SupportLauncher } from "@quikit/ui/support";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen lg:flex">
        {/* Desktop sidebar is a flex child; its animated width makes the content reflow automatically. */}
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 lg:py-8">{children}</main>
        </div>
      </div>
      <CommandPalette />
      <AiDock />
      {/* Floating support launcher. Lifted 64px so it stacks ABOVE the AiDock
          FAB (fixed bottom-5 right-5) instead of covering it. */}
      <SupportLauncher appSlug="quikfinance" bottomOffset={64} />
    </SidebarProvider>
  );
}
