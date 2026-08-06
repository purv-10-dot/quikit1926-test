'use client';
/**
 * useTenantOnboarding — ported from the old QuikSkills frontend
 * (src/hooks/useTenantOnboarding.ts).
 *
 * Validates + formats the GST number client-side, then provisions a tenant via
 * POST /api/tenants. Exposes { createTenant, loading, error, success }.
 */
import { useState } from 'react';
import { api } from '@/lib/api';
import { validateGST, formatGST } from '@/lib/utils/gstValidator';

export interface CreateTenantData {
  name: string;
  gstNumber: string;
  dbConnectionString?: string;
}

export interface TenantResponse {
  success: boolean;
  data: {
    _id: string;
    name: string;
    subdomain: string;
    gstNumber: string;
    tenantKey: string;
    status: string;
    createdAt: string;
  };
  message: string;
  clientUrl: string;
}

export const useTenantOnboarding = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<TenantResponse | null>(null);

  const createTenant = async (data: CreateTenantData) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate GST before sending
      if (!validateGST(data.gstNumber)) {
        throw new Error('Invalid GST Number format');
      }

      // Format GST number
      const formattedData = {
        ...data,
        gstNumber: formatGST(data.gstNumber),
      };

      const response = await api.post<TenantResponse>('/tenants', formattedData);
      setSuccess(response);
      return response;
    } catch (err: unknown) {
      const errorMessage =
        (err as { message?: string })?.message || 'Failed to create tenant';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    createTenant,
    loading,
    error,
    success,
  };
};
