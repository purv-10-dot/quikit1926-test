import { AdaptiveShell } from '@/components/AdaptiveShell';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdaptiveShell>{children}</AdaptiveShell>;
}
