"use client";
import "./chartSetup";
import { Bar } from "react-chartjs-2";

interface Props {
  labels: string[];
  datasets: { data: number[]; backgroundColor: string; label: string }[];
  gridColor?: string;
  tickColor?: string;
}

export default function GroupedBarChart({ labels, datasets, gridColor = "#E7E5DD", tickColor = "#6C6A64" }: Props) {
  return (
    <Bar
      data={{ labels, datasets: datasets.map((d) => ({ ...d, borderRadius: 4 })) }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: {
          y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 11 } } },
        },
      }}
    />
  );
}
