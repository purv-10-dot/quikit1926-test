import { PortalGate } from "@/components/portal/PortalGate";

export const dynamic = "force-dynamic";

export default function VendorPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalGate portal="vendor">{children}</PortalGate>;
}
