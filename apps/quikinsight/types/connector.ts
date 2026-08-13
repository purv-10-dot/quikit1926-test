export type ConnectorCategory =
  | "Analytics"
  | "Advertising"
  | "Organic & social"
  | "CRM"
  | "Email & outbound";

export interface Connector {
  id: string;
  name: string;
  category: ConnectorCategory;
  initials: string;
  color: string;
  connected: boolean;
  lastSyncedAt?: string; // ISO timestamp, only present when connected
  /** Whether a real backend integration exists yet. false → shown as "coming soon". */
  available?: boolean;
}
