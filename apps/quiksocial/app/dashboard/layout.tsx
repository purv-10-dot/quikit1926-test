import DashboardLayout from "@/components/layout/dashboard-layout";
import { BrandCreationProvider } from "@/components/providers/BrandCreationContext";
import { SessionGuard } from "@/components/session-guard";

// Every page under /dashboard reads the session, hits MongoDB, or talks to
// internal API routes. Marking the segment dynamic prevents Next.js from
// trying to statically prerender these routes at build time.
export const dynamic = "force-dynamic";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionGuard>
      <BrandCreationProvider>
        <DashboardLayout>{children}</DashboardLayout>
      </BrandCreationProvider>
    </SessionGuard>
  );
}
