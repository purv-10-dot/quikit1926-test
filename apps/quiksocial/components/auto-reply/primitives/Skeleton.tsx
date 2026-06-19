"use client";

/**
 * Shape-matching skeletons for the three Auto-Reply tabs. Tinted to read
 * against the dark glass parent surface — solid greys disappear into the
 * green-hills background image.
 */

type Variant = "rule" | "log" | "post" | "kpi";

const PULSE_BG = "rgba(255, 255, 255, 0.08)";
const CARD_BG = "rgba(33, 33, 33, 0.14)";
const CARD_BORDER = "1px solid rgba(255, 255, 255, 0.10)";

function PulseBlock({
  width = "100%",
  height = 16,
  rounded = 6,
}: {
  width?: number | string;
  height?: number;
  rounded?: number;
}) {
  return (
    <div
      className="animate-pulse"
      style={{
        width,
        height,
        borderRadius: rounded,
        background: PULSE_BG,
      }}
    />
  );
}

function GlassShell({ children, padding = "14px 18px" }: { children: React.ReactNode; padding?: string }) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: CARD_BORDER,
        borderRadius: 16,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        padding,
      }}
    >
      {children}
    </div>
  );
}

function RuleSkel() {
  return (
    <GlassShell>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <PulseBlock width={140} height={14} />
          <div style={{ display: "flex", gap: 6 }}>
            <PulseBlock width={70} height={18} />
            <PulseBlock width={90} height={18} />
          </div>
          <PulseBlock width="60%" height={12} />
        </div>
        <PulseBlock width={64} height={22} rounded={11} />
      </div>
    </GlassShell>
  );
}

function LogSkel() {
  return (
    <GlassShell padding="12px 16px">
      <div style={{ display: "flex", gap: 10 }}>
        <div
          className="animate-pulse"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: PULSE_BG,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <PulseBlock width="40%" height={12} />
          <PulseBlock width="90%" height={14} />
          <PulseBlock width="70%" height={14} />
        </div>
      </div>
    </GlassShell>
  );
}

function PostSkel() {
  return (
    <GlassShell padding="12px 16px">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          className="animate-pulse"
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            background: PULSE_BG,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <PulseBlock width="50%" height={14} />
          <PulseBlock width="30%" height={11} />
        </div>
        <PulseBlock width={40} height={22} rounded={11} />
      </div>
    </GlassShell>
  );
}

function KpiSkel() {
  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 12,
        padding: "14px 16px",
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <PulseBlock width={80} height={12} />
      <PulseBlock width={60} height={22} />
    </div>
  );
}

export function Skeleton({
  variant,
  count = 3,
}: {
  variant: Variant;
  count?: number;
}) {
  if (variant === "kpi") {
    return (
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {Array.from({ length: count }).map((_, i) => (
          <KpiSkel key={i} />
        ))}
      </div>
    );
  }

  const Item = variant === "rule" ? RuleSkel : variant === "log" ? LogSkel : PostSkel;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Item key={i} />
      ))}
    </div>
  );
}
