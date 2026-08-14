export type ChannelType = "paid" | "organic";

export interface Channel {
  name: string;
  color: string;
  spend: number;      // in $K
  pipeline: number;    // in $K
  type: ChannelType;
}

export interface Campaign {
  id: string;
  name: string;
  channel: string;
  spend: number;   // $K
  pipeline: number; // $K
  roas: number;
}

export interface KpiCard {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  sub: string;
}
