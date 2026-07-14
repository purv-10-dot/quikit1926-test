// Subtle content down-scale for the People / Employees module (see recruit/layout).
export default function EmployeesLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ zoom: 0.9 }}>{children}</div>;
}
