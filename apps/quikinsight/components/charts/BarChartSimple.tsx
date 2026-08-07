"use client";
import "./chartSetup";
import { Bar } from "react-chartjs-2";

interface Props {
  labels: string[];
  data: number[];
  colors?: string | string[];
  gridColor?: string;
  tickColor?: string;
}

export default function BarChartSimple({ labels, data, colors = "#DBDAD3", gridColor = "#E7E5DD", tickColor = "#6C6A64" }: Props) {
  return (
    <Bar
      data={{ labels, datasets: [{ data, backgroundColor: colors, borderRadius: 5 }] }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 11 } } },
        },
      }}
    />
  );
}
