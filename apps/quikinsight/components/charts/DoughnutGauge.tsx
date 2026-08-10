"use client";
import "./chartSetup";
import { Doughnut } from "react-chartjs-2";

interface Props {
  value: number; // 0-100
  color?: string;
  trackColor?: string;
  fullRing?: boolean; // true = 360deg ring (gauge), false = standard doughnut
}

export default function DoughnutGauge({ value, color = "#6C5CE0", trackColor = "#E7E5DD", fullRing = true }: Props) {
  return (
    <Doughnut
      data={{ datasets: [{ data: [value, 100 - value], backgroundColor: [color, trackColor], borderWidth: 0 }] }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        cutout: fullRing ? "76%" : "72%",
        rotation: fullRing ? -90 : 0,
        circumference: 360,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      }}
    />
  );
}
