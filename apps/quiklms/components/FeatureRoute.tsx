'use client';
/**
 * FeatureRoute — ported from the old QuikLMSs frontend
 * (src/components/FeatureRoute.tsx).
 *
 * Gates children behind a tenant feature flag. The legacy version was a
 * react-router route guard that returned <Navigate to={...} replace />; under
 * the App Router the same redirects are performed with next/navigation's
 * router.replace() from an effect, rendering null while the redirect settles.
 */
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatures } from '@/app/providers';
import type { FeatureSet } from '@/lib/features';

interface FeatureRouteProps {
  feature: keyof FeatureSet;
  children: React.ReactElement;
  fallbackPath?: string;
}

/**
 * Wraps a route that requires a specific feature flag to be enabled.
 * If the feature is disabled, redirects to the fallback path (default: appropriate dashboard).
 */
const FeatureRoute: React.FC<FeatureRouteProps> = ({ feature, children, fallbackPath }) => {
  const { features, loaded } = useFeatures();
  const router = useRouter();

  const blocked = loaded && !features[feature];

  useEffect(() => {
    if (!blocked) return;

    // Redirect to fallback or determine based on user role
    if (fallbackPath) {
      router.replace(fallbackPath);
      return;
    }

    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        const activeRole = localStorage.getItem('activeRole') || user.role;
        if (activeRole === 'SUB_ADMIN') {
          router.replace('/sub-admin-dashboard');
          return;
        }
        if (user.role === 'LEARNER') return router.replace('/learner/dashboard');
        if (user.role === 'MANAGER') return router.replace('/manager-dashboard');
        if (user.role === 'TEACHER') return router.replace('/teacher-dashboard');
        if (user.role === 'PARENT') return router.replace('/parent-dashboard');
        if (user.role === 'TENANT_ADMIN') return router.replace('/tenant-dashboard');
        if (user.role === 'SUB_ADMIN') return router.replace('/sub-admin-dashboard');
        if (user.role === 'ADMIN') return router.replace('/dashboard');
      } catch {
        // ignore
      }
    }
    router.replace('/login');
  }, [blocked, fallbackPath, router]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (blocked) {
    return null;
  }

  return children;
};

export default FeatureRoute;
