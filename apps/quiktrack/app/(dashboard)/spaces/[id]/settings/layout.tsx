import { SettingsShell } from "./_components/settings-shell";

export default function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return <SettingsShell projectId={params.id}>{children}</SettingsShell>;
}
