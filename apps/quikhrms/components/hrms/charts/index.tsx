"use client";

import dynamic from "next/dynamic";

const SKELETON = <div className="w-full h-full min-h-[200px] bg-gray-50 animate-pulse rounded" />;

export const BarChartView = dynamic(
  () => import("./_recharts-bundle").then((m) => m.BarChartView),
  { ssr: false, loading: () => SKELETON },
);

export const MultiColorBar = dynamic(
  () => import("./_recharts-bundle").then((m) => m.MultiColorBar),
  { ssr: false, loading: () => SKELETON },
);

export const LineChartView = dynamic(
  () => import("./_recharts-bundle").then((m) => m.LineChartView),
  { ssr: false, loading: () => SKELETON },
);

export const TrendLineChart = dynamic(
  () => import("./_recharts-bundle").then((m) => m.TrendLineChart),
  { ssr: false, loading: () => SKELETON },
);

export const DonutView = dynamic(
  () => import("./_recharts-bundle").then((m) => m.DonutView),
  { ssr: false, loading: () => SKELETON },
);

export const StackedBarView = dynamic(
  () => import("./_recharts-bundle").then((m) => m.StackedBarView),
  { ssr: false, loading: () => SKELETON },
);

export const RadarCompareView = dynamic(
  () => import("./_recharts-bundle").then((m) => m.RadarCompareView),
  { ssr: false, loading: () => SKELETON },
);

export const ScoreBarChartView = dynamic(
  () => import("./_recharts-bundle").then((m) => m.ScoreBarChartView),
  { ssr: false, loading: () => SKELETON },
);

export const MultiLineChartView = dynamic(
  () => import("./_recharts-bundle").then((m) => m.MultiLineChartView),
  { ssr: false, loading: () => SKELETON },
);

export const FunnelView = dynamic(
  () => import("./_recharts-bundle").then((m) => m.FunnelView),
  { ssr: false, loading: () => SKELETON },
);
