'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';

const ResetPasswordPage = () => {
  const router = useRouter();
  const pathname = usePathname();

  const isTeacherRoute = pathname?.startsWith('/teacher-dashboard');
  const backPath = isTeacherRoute ? '/teacher-dashboard' : '/learner/dashboard';
  const roleLabel = isTeacherRoute ? 'Teacher' : 'Learner';

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      setError('Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      setSaving(true);
      await api.post<any>('/auth/change-password', {
        currentPassword: oldPassword,
        newPassword,
        confirmNewPassword,
      });

      setSuccess('Password changed successfully!');
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      setError(err?.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const renderPasswordField = (
    id: string,
    label: string,
    value: string,
    setValue: (value: string) => void,
    showValue: boolean,
    setShowValue: (value: boolean) => void,
    autoComplete: string,
  ) => (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={showValue ? 'text' : 'password'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete={autoComplete}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-12 text-sm text-gray-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
        <button
          type="button"
          onClick={() => setShowValue(!showValue)}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-400 transition hover:text-gray-600"
          aria-label={showValue ? 'Hide password' : 'Show password'}
        >
          {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <button
        type="button"
        onClick={() => router.push(backPath)}
        className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back</span>
      </button>

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-slate-900 via-slate-800 to-primary-700 px-6 py-8 text-white sm:px-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-white/10 p-3">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/75">{roleLabel}</p>
              <h1 className="mt-1 text-2xl font-semibold">
                Reset Password
              </h1>
              <p className="mt-2 max-w-xl text-sm text-white/75">
                Verify your current password before saving a new password for your account.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-8 sm:px-8">
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>Use your current password as the old password. Your new password must be at least 8 characters long.</p>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {renderPasswordField(
              'oldPassword',
              'Old Password',
              oldPassword,
              setOldPassword,
              showOldPassword,
              setShowOldPassword,
              'current-password',
            )}

            {renderPasswordField(
              'newPassword',
              'New Password',
              newPassword,
              setNewPassword,
              showNewPassword,
              setShowNewPassword,
              'new-password',
            )}

            {renderPasswordField(
              'confirmNewPassword',
              'Confirm New Password',
              confirmNewPassword,
              setConfirmNewPassword,
              showConfirmPassword,
              setShowConfirmPassword,
              'new-password',
            )}

            <div className="flex flex-col gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => router.push(backPath)}
                className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
