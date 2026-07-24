/** External mock interview tool (opens in a new browser tab). */
export const MOCK_INTERVIEW_URL =
  'https://interviewbot-500449424211.asia-south1.run.app/';

/**
 * Mock Interview is disabled for corporate tenants (no sidebar entry, no navigation).
 * Only school tenants may see the sidebar control. To restore for corporate, return true
 * when tenantType === 'corporate' below.
 */
export function showMockInterviewInSidebar(
  tenantType: 'corporate' | 'school' | null,
): boolean {
  if (tenantType === 'corporate') {
    return false;
  }
  return tenantType === 'school';
}
