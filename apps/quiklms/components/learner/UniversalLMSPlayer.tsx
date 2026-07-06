'use client';
import { Play } from 'lucide-react';
interface Props { [key: string]: unknown; }
export function UniversalLMSPlayer(_: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-surface-muted p-12 text-center">
      <Play className="size-10 text-[var(--brand-primary)] mb-3" />
      <p className="font-semibold text-fg">UniversalLMSPlayer </p>
      <p className="text-sm text-fg-muted mt-1">Full implementation coming soon</p>
    </div>
  );
}
export default UniversalLMSPlayer;