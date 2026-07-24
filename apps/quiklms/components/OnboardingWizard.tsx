'use client';
/**
 * OnboardingWizard — ported from the old QuikSkills frontend
 * (src/components/OnboardingWizard.tsx).
 *
 * Super-admin tenant onboarding form: company name + GST number (+ optional
 * db connection string), validated with the shared GST validator and submitted
 * through useTenantOnboarding (POST /api/tenants). Shows a provisioning overlay
 * while in flight and a success panel with the new tenant's subdomain,
 * tenant key and client URL.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTenantOnboarding, type CreateTenantData } from '@/hooks/useTenantOnboarding';
import { validateGST, formatGST } from '@/lib/utils/gstValidator';

interface OnboardingFormData {
  name: string;
  gstNumber: string;
  dbConnectionString?: string;
}

const OnboardingWizard = () => {
  const { createTenant, loading, error, success } = useTenantOnboarding();
  const [gstError, setGstError] = useState<string>('');
  const [isProvisioning, setIsProvisioning] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<OnboardingFormData>();

  const gstValue = watch('gstNumber');
  void gstValue;

  const validateGSTField = (value: string) => {
    if (!value) {
      setGstError('');
      return true;
    }
    const formatted = formatGST(value);
    if (!validateGST(formatted)) {
      setGstError('Invalid GST Number format. Expected: 15 characters (e.g., 27AABCU9603R1ZM)');
      return false;
    }
    setGstError('');
    return true;
  };

  const onSubmit = async (data: OnboardingFormData) => {
    // Final GST validation
    if (!validateGST(formatGST(data.gstNumber))) {
      setGstError('Invalid GST Number format');
      return;
    }

    setIsProvisioning(true);
    try {
      const formattedData: CreateTenantData = {
        name: data.name.trim(),
        gstNumber: formatGST(data.gstNumber),
        dbConnectionString: data.dbConnectionString?.trim() || undefined,
      };

      await createTenant(formattedData);
    } catch {
      // Error is handled by the hook
    } finally {
      setIsProvisioning(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto mt-8 p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-16 w-16 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Tenant Provisioned Successfully!
          </h2>
          <p className="text-gray-600 mb-6">
            Your company portal has been created and is ready to use.
          </p>
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <div className="text-left space-y-3">
              <div>
                <span className="text-sm font-medium text-gray-500">Company Name:</span>
                <p className="text-lg font-semibold text-gray-900">{success.data.name}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Subdomain:</span>
                <p className="text-lg font-semibold text-gray-900">{success.data.subdomain}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Tenant Key:</span>
                <p className="text-sm font-mono text-gray-700">{success.data.tenantKey}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Client URL:</span>
                <a
                  href={success.clientUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg font-semibold text-primary-600 hover:text-primary-700 underline"
                >
                  {success.clientUrl}
                </a>
              </div>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Create Another Tenant
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-8 p-8 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Super Admin - Tenant Onboarding
        </h1>
        <p className="text-gray-600">
          Create a new company portal by filling in the details below.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Company Name */}
        <div>
          <label htmlFor="name" className="label-field">
            Company Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            {...register('name', {
              required: 'Company name is required',
              minLength: {
                value: 2,
                message: 'Company name must be at least 2 characters',
              },
            })}
            className="input-field"
            placeholder="Enter company name"
            disabled={loading || isProvisioning}
          />
          {errors.name && (
            <p className="error-message">{errors.name.message}</p>
          )}
        </div>

        {/* GST Number */}
        <div>
          <label htmlFor="gstNumber" className="label-field">
            GST Number <span className="text-red-500">*</span>
          </label>
          <input
            id="gstNumber"
            type="text"
            {...register('gstNumber', {
              required: 'GST Number is required',
              validate: validateGSTField,
              onChange: (e) => {
                const formatted = formatGST(e.target.value);
                e.target.value = formatted;
                validateGSTField(formatted);
              },
            })}
            className="input-field"
            placeholder="27AABCU9603R1ZM"
            maxLength={15}
            disabled={loading || isProvisioning}
          />
          {errors.gstNumber && (
            <p className="error-message">{errors.gstNumber.message}</p>
          )}
          {gstError && <p className="error-message">{gstError}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Format: 15 characters (e.g., 27AABCU9603R1ZM)
          </p>
        </div>

        {/* Database Connection String (Optional) */}
        <div>
          <label htmlFor="dbConnectionString" className="label-field">
            Database Connection String (Optional)
          </label>
          <input
            id="dbConnectionString"
            type="text"
            {...register('dbConnectionString')}
            className="input-field"
            placeholder="mongodb://localhost:27017/tenant-db"
            disabled={loading || isProvisioning}
          />
          <p className="text-xs text-gray-500 mt-1">
            Leave empty to use default database with logical isolation
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading || isProvisioning}
            className="btn-primary flex-1"
          >
            {isProvisioning ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Provisioning Portal...
              </span>
            ) : (
              'Create Portal'
            )}
          </button>
        </div>
      </form>

      {/* Provisioning Loader Overlay */}
      {isProvisioning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md mx-4">
            <div className="text-center">
              <svg
                className="animate-spin h-12 w-12 text-primary-600 mx-auto mb-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Provisioning Portal...
              </h3>
              <p className="text-gray-600">
                Creating tenant, generating subdomain, and setting up infrastructure.
                This may take a few moments.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { OnboardingWizard };
export default OnboardingWizard;
