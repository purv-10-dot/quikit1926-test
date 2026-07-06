'use client';
import { HelpCircle } from 'lucide-react';
interface Props { [key: string]: unknown; }
export function VideoQuiz(_: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-surface-muted p-12 text-center">
      <HelpCircle className="size-10 text-[var(--brand-primary)] mb-3" />
      <p className="font-semibold text-fg">VideoQuiz </p>
      <p className="text-sm text-fg-muted mt-1">Full implementation coming soon</p>
    </div>
  );
}
export default VideoQuiz;