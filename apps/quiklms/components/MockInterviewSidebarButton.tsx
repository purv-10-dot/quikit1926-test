'use client';
/**
 * MockInterviewSidebarButton — ported from the old QuikSkills frontend
 * (src/components/MockInterviewSidebarButton.tsx).
 *
 * Sidebar control that opens the external mock interview app in a new tab.
 */
import { Mic } from 'lucide-react';
import { MOCK_INTERVIEW_URL } from '@/lib/constants/mockInterview';

type Props = {
  sidebarOpen: boolean;
  /** e.g. close drawer on mobile after click */
  onAfterOpen?: () => void;
};

/**
 * Opens the mock interview app in a new tab.
 * Not shown for corporate tenants (see `showMockInterviewInSidebar` in lib/constants/mockInterview.ts).
 */
export function MockInterviewSidebarButton({ sidebarOpen, onAfterOpen }: Props) {
  return (
    <button
      type="button"
      title={!sidebarOpen ? 'Mock interview' : undefined}
      onClick={() => {
        window.open(MOCK_INTERVIEW_URL, '_blank', 'noopener,noreferrer');
        onAfterOpen?.();
      }}
      className={`w-full flex items-center py-2.5 rounded-lg transition-all text-sm text-gray-600 hover:bg-gray-100 border-l-[3px] border-transparent ${
        sidebarOpen ? 'gap-3 px-3' : 'justify-center px-2'
      }`}
    >
      <Mic className="w-5 h-5 flex-shrink-0" />
      {sidebarOpen && <span className="truncate text-left font-medium">Mock interview</span>}
    </button>
  );
}
