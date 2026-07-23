// Subtle content down-scale for the Dashboard home (see recruit/layout).
export default function DashboardHomeLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ zoom: 0.9 }}>{children}</div>;
}
