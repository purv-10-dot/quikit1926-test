import { PortalGate } from "@/components/portal/PortalGate";

export const dynamic = "force-dynamic";

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalGate portal="client">{children}</PortalGate>;
}
