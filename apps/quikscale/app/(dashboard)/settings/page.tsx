"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/auth/login");
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-4xl font-bold font-display mb-2">Settings</h1>
      <p className="text-text-secondary mb-8">Manage your account and preferences</p>

      <div className="space-y-6">
        {/* Tenant Settings */}
        <div className="bg-white border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Tenant Settings</h2>
          <p className="text-text-secondary mb-4">Full settings coming in Phase 14</p>
          <div className="space-y-2">
            <p className="text-sm"><span className="font-medium">Tenant:</span> Demo Company</p>
            <p className="text-sm"><span className="font-medium">Plan:</span> Growth</p>
          </div>
        </div>

        {/* Account */}
        <div className="bg-white border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Account</h2>
          <p className="text-text-secondary mb-4 text-sm">Manage your account</p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-danger text-white rounded-lg hover:bg-danger-dark transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
