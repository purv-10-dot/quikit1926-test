"use client";

/**
 * Super Admin: Pricing & Plans — /pricing
 *
 * View and manage subscription plans, org limits, and pricing tiers.
 * Placeholder UI for now — will wire to a billing provider later.
 */

import { Check, Users, LayoutGrid, HardDrive, Info } from "lucide-react";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    description: "For individuals and small teams getting started",
    limits: { users: "5 users", apps: "2 apps", storage: "1 GB storage" },
    highlighted: false,
  },
  {
    name: "Growth",
    price: "$29",
    period: "/mo",
    description: "For growing teams that need more power",
    limits: { users: "25 users", apps: "10 apps", storage: "10 GB storage" },
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations with advanced needs",
    limits: {
      users: "Unlimited users",
      apps: "Unlimited apps",
      storage: "100 GB storage",
    },
    highlighted: false,
  },
];

function PlanCard({
  plan,
}: {
  plan: (typeof PLANS)[number];
}) {
  return (
    <div
      className={`bg-white rounded-xl border shadow-sm p-6 flex flex-col ${
        plan.highlighted
          ? "border-indigo-300 shadow-md ring-2 ring-indigo-100"
          : "border-gray-200"
      }`}
    >
      {plan.highlighted && (
        <span className="self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-700 mb-3">
          Most Popular
        </span>
      )}
      <h3 className="text-lg font-bold text-gray-900 mb-1">{plan.name}</h3>
      <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
      <div className="mb-6">
        <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
        {plan.period && (
          <span className="text-sm text-gray-500">{plan.period}</span>
        )}
      </div>
      <div className="space-y-3 flex-1">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
            <Check className="h-3 w-3 text-green-600" />
          </div>
          <span className="text-sm text-gray-600 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-gray-400" />
            {plan.limits.users}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
            <Check className="h-3 w-3 text-green-600" />
          </div>
          <span className="text-sm text-gray-600 flex items-center gap-1.5">
            <LayoutGrid className="h-3.5 w-3.5 text-gray-400" />
            {plan.limits.apps}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
            <Check className="h-3 w-3 text-green-600" />
          </div>
          <span className="text-sm text-gray-600 flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-gray-400" />
            {plan.limits.storage}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <div>
      {/* Page header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-gray-900">Pricing & Plans</h1>
        <p className="text-sm text-gray-500">
          Manage subscription tiers and organization limits
        </p>
      </div>

      {/* Plan cards */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>

        {/* Coming soon banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900">
              Billing integration coming soon
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              Plans are currently display-only. Wire to Stripe or LemonSqueezy
              when ready.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
