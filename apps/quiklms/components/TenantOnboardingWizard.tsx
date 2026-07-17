'use client';
/**
 * TenantOnboardingWizard — ported from the old QuikSkills frontend
 * (`src/components/TenantOnboardingWizard.tsx`), replacing a 24-line stub.
 *
 * Mounted by `app/(super-admin)/tenants/page.tsx`. This is the ONLY caller of
 * `POST /api/tenants/onboard`, which was hardened earlier in this migration pass
 * — until now that endpoint had no UI to drive it (GAP_REPORT §4b).
 *
 * Contract verified field-by-field against the route's zod schema
 * (`app/api/tenants/onboard/route.ts`): every required field — orgName,
 * fullAddress, country, officialPhone, officialEmail, firstName, lastName, phone,
 * email, roleInOrganization, billingFirstName, billingLastName, billingAddress —
 * is registered on this form, plus the optional website / middleName /
 * billingMiddleName / storageLimit and the defaulted tenantType.
 *
 * NOT ported alongside it, deliberately: `OnboardingWizard` and its
 * `useTenantOnboarding` hook. That hook POSTs to `/tenants` with only
 * {name, gstNumber} — an endpoint that could never succeed (its DTO carried 4
 * fields while the schema required 13 more; see the QUESTION in §3.2 tenants).
 * Its only consumer was `SuperAdminOnboarding`, which this app has already
 * reimplemented as `/onboarding` (902 lines) posting to `/tenants/onboard`
 * directly. Porting either would be dead code.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, ChevronRight, ChevronLeft, Building2, User, CreditCard, GraduationCap, Briefcase } from 'lucide-react';
import { api } from '@/lib/api';

interface OrganizationProfile {
  tenantType: 'corporate' | 'school';
  orgName: string;
  fullAddress: string;
  country: string;
  officialPhone: string;
  website: string;
  officialEmail: string;
}

interface PrimaryContact {
  firstName: string;
  middleName?: string;
  lastName: string;
  phone: string;
  email: string;
  roleInOrganization: string;
}

interface BillingInfo {
  billingFirstName: string;
  billingMiddleName?: string;
  billingLastName: string;
  billingAddress: string;
  storageLimit?: number;
}

interface TenantOnboardingData extends OrganizationProfile, PrimaryContact, BillingInfo {}

interface TenantOnboardingWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

const TenantOnboardingWizard: React.FC<TenantOnboardingWizardProps> = ({
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields, isSubmitted },
    trigger,
    getValues,
    setValue,
    watch,
  } = useForm<TenantOnboardingData>({
    mode: 'onTouched', // Only validate after user has interacted with fields
    defaultValues: {
      tenantType: 'corporate',
      storageLimit: 2, // Default 2GB
      // Ensure billing fields start empty
      billingFirstName: '',
      billingMiddleName: '',
      billingLastName: '',
      billingAddress: '',
    },
  });

  const watchedTenantType = watch('tenantType');

  const steps = [
    { id: 1, title: 'Organization Profile', icon: Building2 },
    { id: 2, title: 'Primary Contact', icon: User },
    { id: 3, title: 'Billing & Quota', icon: CreditCard },
  ];

  const countries = [
    'United States',
    'United Kingdom',
    'Canada',
    'Australia',
    'India',
    'Germany',
    'France',
    'Other',
  ];

  const organizationRoles = [
    'HR Head',
    'CEO',
    'CTO',
    'Learning & Development Manager',
    'Training Manager',
    'Operations Manager',
    'Other',
  ];

  const validateStep = async (step: number): Promise<boolean> => {
    let fields: (keyof TenantOnboardingData)[] = [];

    switch (step) {
      case 1:
        fields = ['orgName', 'fullAddress', 'country', 'officialPhone', 'officialEmail'];
        break;
      case 2:
        fields = ['firstName', 'lastName', 'phone', 'email', 'roleInOrganization'];
        break;
      case 3:
        fields = ['billingFirstName', 'billingLastName', 'billingAddress'];
        break;
    }

    const result = await trigger(fields);
    return result;
  };

  const handleNext = async () => {
    const isValid = await validateStep(currentStep);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, 3));
      setError(null);
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    setError(null);
  };

  const onSubmit = async (data: TenantOnboardingData) => {
    setIsSubmitting(true);
    setError(null);
    setProgress(0);

    let progressInterval: NodeJS.Timeout | null = null;

    try {
      // Simulate progress updates
      progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            if (progressInterval) clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      // Auto-prepend https:// to website if it's missing protocol
      const processedData = { ...data };
      if (processedData.website && processedData.website.trim() && !processedData.website.match(/^https?:\/\//i)) {
        processedData.website = `https://${processedData.website.trim()}`;
      }

      // The response is deliberately not read — the wizard only signals success.
      // (It carries a plaintext `adminTempPassword`; the tenants page reloads its
      // list rather than surfacing it here.)
      await api.post('/tenants/onboard', {
        ...processedData,
        tenantType: processedData.tenantType || 'corporate',
        storageLimit: processedData.storageLimit || 2,
      });

      if (progressInterval) clearInterval(progressInterval);
      setProgress(100);

      // Wait a moment to show 100% progress
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: unknown) {
      // Clear progress interval if it exists
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setIsSubmitting(false);
      setProgress(0);

      // The fetch client throws the parsed error BODY itself, so what axios
      // exposed at `err.response.data` is simply `err` here — one level shallower
      // at every branch below.
      //
      // The `errors` key is checked first, as in the original, even though this
      // app never emits it: the legacy filter attached `errors` only for this
      // endpoint's ZodError mapping, and `lib/http.ts` emits `validationErrors`
      // instead (GAP_REPORT §3.1, deviation 2). The `||` fallback is what makes
      // the field-by-field display keep working — which is exactly why it is
      // preserved rather than simplified.
      const e = err as {
        errors?: { field: string; message: string }[];
        validationErrors?: { field: string; message: string }[];
        message?: string;
        error?: string;
      };

      if (e?.errors || e?.validationErrors) {
        const validationErrors = (e.errors || e.validationErrors || [])
          .map((x) => `• ${x.field}: ${x.message}`)
          .join('\n');
        setError(`Validation failed:\n${validationErrors}`);
      } else if (e?.message) {
        // Use the detailed message from backend
        setError(e.message);
      } else {
        setError(
          e?.error ||
            'Failed to onboard tenant. Please check all fields and try again.',
        );
      }
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            {/* Tenant Type Selection */}
            <div>
              <label className="label-field">
                Organization Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <button
                  type="button"
                  onClick={() => setValue('tenantType', 'corporate')}
                  disabled={isSubmitting}
                  className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 ${
                    watchedTenantType === 'corporate'
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Briefcase className={`w-8 h-8 ${watchedTenantType === 'corporate' ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <div className="text-center">
                    <p className={`font-semibold ${watchedTenantType === 'corporate' ? 'text-indigo-700' : 'text-gray-700'}`}>Corporate</p>
                    <p className="text-xs text-gray-500 mt-1">Employee training, compliance, SCORM</p>
                  </div>
                  {watchedTenantType === 'corporate' && (
                    <div className="absolute top-3 right-3 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setValue('tenantType', 'school')}
                  disabled={isSubmitting}
                  className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 ${
                    watchedTenantType === 'school'
                      ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <GraduationCap className={`w-8 h-8 ${watchedTenantType === 'school' ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <div className="text-center">
                    <p className={`font-semibold ${watchedTenantType === 'school' ? 'text-emerald-700' : 'text-gray-700'}`}>School</p>
                    <p className="text-xs text-gray-500 mt-1">Batches, attendance, homework, credits</p>
                  </div>
                  {watchedTenantType === 'school' && (
                    <div className="absolute top-3 right-3 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </div>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="label-field">
                Organization Name <span className="text-red-500">*</span>
              </label>
              <input
                {...register('orgName', { required: 'Organization name is required' })}
                className="input-field"
                placeholder="Acme Corporation"
                disabled={isSubmitting}
              />
              {errors.orgName && (
                <p className="error-message">{errors.orgName.message}</p>
              )}
            </div>

            <div>
              <label className="label-field">
                Full Address <span className="text-red-500">*</span>
              </label>
              <textarea
                {...register('fullAddress', { required: 'Address is required' })}
                className="input-field"
                rows={3}
                placeholder="123 Business Street, Suite 100, City, State, ZIP"
                disabled={isSubmitting}
              />
              {errors.fullAddress && (
                <p className="error-message">{errors.fullAddress.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label-field">
                  Country <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('country', { required: 'Country is required' })}
                  className="input-field"
                  disabled={isSubmitting}
                >
                  <option value="">Select Country</option>
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
                {errors.country && (
                  <p className="error-message">{errors.country.message}</p>
                )}
              </div>

              <div>
                <label className="label-field">
                  Official Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  {...register('officialPhone', {
                    required: 'Phone number is required',
                    pattern: {
                      value: /^[\d\s\-\+\(\)]+$/,
                      message: 'Invalid phone number format',
                    },
                  })}
                  className="input-field"
                  placeholder="+1 (555) 123-4567"
                  disabled={isSubmitting}
                />
                {errors.officialPhone && (
                  <p className="error-message">{errors.officialPhone.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label-field">
                  Website
                </label>
                <input
                  type="url"
                  {...register('website', {
                    pattern: {
                      value: /^https?:\/\/.+/,
                      message: 'Please enter a valid URL (e.g., https://example.com)',
                    },
                  })}
                  className="input-field"
                  placeholder="https://example.com"
                  disabled={isSubmitting}
                />
                {errors.website && (
                  <p className="error-message">{errors.website.message}</p>
                )}
              </div>

              <div>
                <label className="label-field">
                  Official Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  {...register('officialEmail', {
                    required: 'Official email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address',
                    },
                  })}
                  className="input-field"
                  placeholder="contact@example.com"
                  disabled={isSubmitting}
                />
                {errors.officialEmail && (
                  <p className="error-message">{errors.officialEmail.message}</p>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label-field">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('firstName', { required: 'First name is required' })}
                  className="input-field"
                  placeholder="John"
                  disabled={isSubmitting}
                />
                {errors.firstName && (
                  <p className="error-message">{errors.firstName.message}</p>
                )}
              </div>

              <div>
                <label className="label-field">Middle Name</label>
                <input
                  {...register('middleName')}
                  className="input-field"
                  placeholder="Michael"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="label-field">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('lastName', { required: 'Last name is required' })}
                  className="input-field"
                  placeholder="Doe"
                  disabled={isSubmitting}
                />
                {errors.lastName && (
                  <p className="error-message">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label-field">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  {...register('phone', {
                    required: 'Phone number is required',
                    pattern: {
                      value: /^[\d\s\-\+\(\)]+$/,
                      message: 'Invalid phone number format',
                    },
                  })}
                  className="input-field"
                  placeholder="+1 (555) 123-4567"
                  disabled={isSubmitting}
                />
                {errors.phone && (
                  <p className="error-message">{errors.phone.message}</p>
                )}
              </div>

              <div>
                <label className="label-field">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address',
                    },
                  })}
                  className="input-field"
                  placeholder="john.doe@example.com"
                  disabled={isSubmitting}
                />
                {errors.email && (
                  <p className="error-message">{errors.email.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="label-field">
                Role in Organization <span className="text-red-500">*</span>
              </label>
              <select
                {...register('roleInOrganization', {
                  required: 'Role is required',
                })}
                className="input-field"
                disabled={isSubmitting}
              >
                <option value="">Select Role</option>
                {organizationRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              {errors.roleInOrganization && (
                <p className="error-message">{errors.roleInOrganization.message}</p>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Base Plan:</strong> Default storage limit is set to 2GB. This can be
                upgraded later.
              </p>
            </div>

            {/* Optional: Copy from Primary Contact */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => {
                  const primaryContact = getValues();
                  // Copy primary contact details to billing
                  setValue('billingFirstName', primaryContact.firstName || '');
                  setValue('billingMiddleName', primaryContact.middleName || '');
                  setValue('billingLastName', primaryContact.lastName || '');
                  // Use organization address as default billing address
                  setValue('billingAddress', primaryContact.fullAddress || '');
                }}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium underline"
                disabled={isSubmitting}
              >
                Copy from Primary Contact
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label-field">
                  Billing First Name <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('billingFirstName', {
                    required: 'Billing first name is required',
                  })}
                  className="input-field"
                  placeholder="John"
                  autoComplete="billing given-name"
                  disabled={isSubmitting}
                />
                {errors.billingFirstName && (touchedFields.billingFirstName || isSubmitted) && (
                  <p className="error-message">{errors.billingFirstName.message}</p>
                )}
              </div>

              <div>
                <label className="label-field">Billing Middle Name</label>
                <input
                  {...register('billingMiddleName')}
                  className="input-field"
                  placeholder="Michael"
                  autoComplete="billing additional-name"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="label-field">
                  Billing Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('billingLastName', {
                    required: 'Billing last name is required',
                  })}
                  className="input-field"
                  placeholder="Doe"
                  autoComplete="billing family-name"
                  disabled={isSubmitting}
                />
                {errors.billingLastName && (touchedFields.billingLastName || isSubmitted) && (
                  <p className="error-message">{errors.billingLastName.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="label-field">
                Billing Address <span className="text-red-500">*</span>
              </label>
              <textarea
                {...register('billingAddress', {
                  required: 'Billing address is required',
                })}
                className="input-field"
                rows={3}
                placeholder="123 Billing Street, Suite 200, City, State, ZIP"
                autoComplete="billing street-address"
                disabled={isSubmitting}
              />
              {errors.billingAddress && (touchedFields.billingAddress || isSubmitted) && (
                <p className="error-message">{errors.billingAddress.message}</p>
              )}
            </div>

            <div>
              <label className="label-field">Storage Limit (GB)</label>
              <input
                type="number"
                {...register('storageLimit', {
                  min: { value: 1, message: 'Minimum 1GB required' },
                  max: { value: 1000, message: 'Maximum 1000GB allowed' },
                  valueAsNumber: true,
                })}
                className="input-field"
                placeholder="2"
                disabled={isSubmitting}
              />
              {errors.storageLimit && (
                <p className="error-message">{errors.storageLimit.message}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Default: 2GB (Base Plan)
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Onboard New Tenant</h2>
            <p className="text-sm text-gray-600 mt-1">
              Step {currentStep} of {steps.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isSubmitting}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;

              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        isActive
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : isCompleted
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'bg-gray-100 border-gray-300 text-gray-400'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span
                      className={`text-xs mt-2 ${
                        isActive ? 'text-primary-600 font-medium' : 'text-gray-500'
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 mx-2 ${
                        isCompleted ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6">
          {renderStepContent()}

          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm font-semibold mb-2">Validation Errors:</p>
              <div className="text-red-700 text-sm whitespace-pre-line">
                {error.split('\n').map((line, index) => (
                  <p key={index} className="mb-1">{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* Progress Bar (when submitting) */}
          {isSubmitting && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Setting up Environment...</span>
                <span className="text-gray-900 font-medium">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleBack}
              disabled={currentStep === 1 || isSubmitting}
              className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            {currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={isSubmitting}
                className="btn-primary inline-flex items-center gap-2"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Submit & Launch'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default TenantOnboardingWizard;

