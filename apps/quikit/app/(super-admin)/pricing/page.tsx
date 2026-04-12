"use client";

/**
 * Super Admin: Pricing & Plans — /pricing
 *
 * View and manage subscription plans, org limits, and pricing tiers.
 * Placeholder UI for now — will wire to a billing provider later.
 */

import { CreditCard, Users, Building2, LayoutGrid } from "lucide-react";

const PLANS = [
  {
    name: "Free",
    price: "$0/mo",
    limits: { users: 5, apps: 2, storage: "1 GB" },
    color: "border-gray-200 bg-gray-50",
  },
  {
    name: "Growth",
    price: "$29/mo",
    limits: { users: 25, apps: 10, storage: "10 GB" },
    color: "border-indigo-200 bg-indigo-50",
  },
  {
    name: "Enterprise",
    price: "Custom",
    limits: { users: "Unlimited", apps: "Unlimited", storage: "100 GB" },
    color: "border-purple-200 bg-purple-50",
  },
];

export default function PricingPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">Pricing & Plans</h1>
        <p className="text-sm text-gray-500">
          Manage subscription tiers and organization limits
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`border rounded-2xl p-6 ${plan.color}`}
          >
            <h3 className="text-lg font-bold text-gray-900 mb-1">{plan.name}</h3>
            <p className="text-2xl font-bold text-indigo-600 mb-4">{plan.price}</p>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                <span>{plan.limits.users} users</span>
              </div>
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-gray-400" />
                <span>{plan.limits.apps} apps</span>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-gray-400" />
                <span>{plan.limits.storage} storage</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-800">
          💡 Billing integration coming soon. Plans are currently display-only.
          Wire to Stripe or LemonSqueezy when ready.
        </p>
      </div>
    </div>
  );
}
