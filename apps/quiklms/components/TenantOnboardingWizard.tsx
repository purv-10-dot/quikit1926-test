'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  onClose?: () => void;
  [key: string]: unknown;
}

/**
 * Thin forwarder to the real onboarding wizard at /onboarding — a full 4-step
 * flow that provisions a platform Org + a CENTRALIZED tenant admin (login-capable
 * via SSO). Kept as a component so existing `showWizard` call sites keep working;
 * it just routes there instead of showing a placeholder.
 */
export function TenantOnboardingWizard({ onClose }: Props) {
  const router = useRouter();
  useEffect(() => {
    onClose?.();
    router.push('/onboarding');
  }, [router, onClose]);
  return null;
}
export default TenantOnboardingWizard;
