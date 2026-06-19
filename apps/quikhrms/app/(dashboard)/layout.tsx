import { Sidebar } from "@/components/hrms/layout/sidebar";
import { TopBar } from "@/components/hrms/layout/top-bar";
import { BackButton } from "@/components/hrms/layout/back-button";
import { AuthGuard } from "@/components/hrms/layout/auth-guard";

export default function HRMSLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0b1220]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {/* Global nav bar — present on every /hrms page, not just the home dashboard. */}
          <div className="sticky top-0 z-30 bg-gray-50/85 backdrop-blur supports-[backdrop-filter]:bg-gray-50/70 dark:bg-[#0b1220]/85 px-4 lg:px-6 py-3 border-b border-gray-200/60 dark:border-white/10">
            <TopBar />
          </div>
          <div className="p-6">
            <div className="mb-2">
              <BackButton />
            </div>
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
