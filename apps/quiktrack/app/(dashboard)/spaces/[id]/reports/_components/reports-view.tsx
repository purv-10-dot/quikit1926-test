"use client";

import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Layers,
  Timer,
  Rocket,
} from "lucide-react";
import { VelocityReport } from "./velocity-report";
import { ComingSoonCard } from "./coming-soon-card";

/**
 * Reports tab landing. Velocity is the one live report; the rest are greyed
 * "Coming soon" placeholders (mirrors Jira's "More reports" grid). Each report
 * is its own component so shipping a new one is a drop-in replacement for its
 * placeholder card — keep this file a thin composition layer.
 */
const COMING_SOON = [
  { title: "Burnup report", Icon: TrendingUp, description: "Track completed work against total scope to see progress toward sprint completion." },
  { title: "Sprint burndown", Icon: TrendingDown, description: "Watch remaining work fall across a sprint and spot scope creep early." },
  { title: "Cumulative flow", Icon: Layers, description: "See how work items accumulate across statuses over time and find bottlenecks." },
  { title: "Cycle time", Icon: Timer, description: "Understand how long work items take to ship through the pipeline." },
  { title: "Deployment frequency", Icon: Rocket, description: "Measure how often you ship value to customers and gauge delivery risk." },
];

export function ReportsView({ projectId }: { projectId: string }) {
  return (
    <div className="mx-auto  px-10 py-6">
     

      <VelocityReport projectId={projectId} />

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">More reports</h2>
        <p className="mt-1 text-xs text-gray-600">More insights are on the way.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMING_SOON.map((r) => (
            <ComingSoonCard key={r.title} title={r.title} description={r.description} Icon={r.Icon} />
          ))}
        </div>
      </div>
    </div>
  );
}
