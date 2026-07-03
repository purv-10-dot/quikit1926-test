import { PortalGate } from "@/components/portal/PortalGate";

export const dynamic = "force-dynamic";

export default function CaPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalGate portal="ca">{children}</PortalGate>;
}
