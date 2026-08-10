/** Client shapes for the Board Settings (map statuses to columns) UI. */

export interface BoardStatus {
  id: string;
  name: string;
  color: string;
  category: string;
}

export interface BoardColumn {
  /** Client id (stable during editing); real ids aren't needed since PUT replaces all. */
  id: string;
  name: string;
  statusIds: string[];
}

export interface BoardColumnsResponse {
  configured: boolean;
  columns: Array<{ id: string; name: string; statusIds: string[] }>;
  unmappedStatusIds: string[];
  statuses: BoardStatus[];
  countByStatus: Record<string, number>;
}

export const UNMAPPED = "__unmapped__";
