"use client";
import "./chartSetup";
import { Line } from "react-chartjs-2";

interface Props {
  labels: string[];
  data: number[];
  color?: string;
  gridColor?: string;
  tickColor?: string;
  valuePrefix?: string;
  valueSuffix?: string;
  showLegendLabel?: string;
}

export default function LineAreaChart({
  labels,
  data,
  color = "#6C5CE0",
  gridColor = "#E7E5DD",
  tickColor = "#6C6A64",
  valuePrefix = "",
  valueSuffix = "",
  showLegendLabel,
}: Props) {
  return (
    <Line
      data={{
        labels,
        datasets: [
          {
            label: showLegendLabel ?? "",
            data,
            borderColor: color,
            backgroundColor: color + "22",
            fill: true,
            tension: 0.35,
            pointRadius: 3,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: Boolean(showLegendLabel), labels: { font: { size: 10 }, boxWidth: 8 } } },
        scales: {
          y: {
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { size: 11 }, callback: (v) => `${valuePrefix}${v}${valueSuffix}` },
          },
          x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 11 } } },
        },
      }}
    />
  );
}
