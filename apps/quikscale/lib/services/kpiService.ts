import axios from "axios";
import { CreateKPIInput, UpdateKPIInput, WeeklyValueInput, KPINoteInput, KPIListParams } from "@/lib/schemas/kpiSchema";

const API_BASE = "/api/kpi";

// Axios throws on non-2xx with a generic "Request failed with status code N"
// message, which buries the real server error from `response.data.error`.
// Re-throw the server message so callers (and humanizeApiError) can surface it.
function unwrapApiError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const serverMessage =
      (err.response?.data as { error?: unknown } | undefined)?.error;
    if (typeof serverMessage === "string" && serverMessage.length > 0) {
      throw new Error(serverMessage);
    }
  }
  throw err;
}

export interface KPIResponse {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  owner: string;
  teamId?: string;
  parentKPIId?: string;
  quarter: string;
  year: number;
  measurementUnit: string;
  target?: number;
  quarterlyGoal?: number;
  qtdGoal?: number;
  qtdAchieved?: number;
  currentWeekValue?: number;
  progressPercent: number;
  status: string;
  healthStatus: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface WeeklyValueResponse {
  id: string;
  kpiId: string;
  weekNumber: number;
  value?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KPINoteResponse {
  id: string;
  kpiId: string;
  content: string;
  authorId: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KPILogResponse {
  id: string;
  kpiId: string;
  action: string;
  oldValue?: string;
  newValue?: string;
  changedBy: string;
  reason?: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Create KPI
export async function createKPI(input: CreateKPIInput): Promise<KPIResponse> {
  try {
    const response = await axios.post<ApiResponse<KPIResponse>>(`${API_BASE}`, input);
    if (!response.data.success) {
      throw new Error(response.data.error || "Failed to create KPI");
    }
    return response.data.data!;
  } catch (err) {
    unwrapApiError(err);
  }
}

// Get KPIs list with filters
export async function getKPIs(params: Partial<KPIListParams>): Promise<{ data: KPIResponse[]; total: number; page: number; pageSize: number }> {
  const response = await axios.get<ApiResponse<{ kpis: KPIResponse[]; total: number; page: number; pageSize: number }>>(`${API_BASE}`, { params });
  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to fetch KPIs");
  }
  return {
    data: response.data.data!.kpis,
    total: response.data.data!.total,
    page: response.data.data!.page,
    pageSize: response.data.data!.pageSize,
  };
}

// Get single KPI
export async function getKPI(id: string): Promise<KPIResponse> {
  const response = await axios.get<ApiResponse<KPIResponse>>(`${API_BASE}/${id}`);
  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to fetch KPI");
  }
  return response.data.data!;
}

// Update KPI
export async function updateKPI(id: string, input: Partial<UpdateKPIInput>): Promise<KPIResponse> {
  try {
    const response = await axios.put<ApiResponse<KPIResponse>>(`${API_BASE}/${id}`, input);
    if (!response.data.success) {
      throw new Error(response.data.error || "Failed to update KPI");
    }
    return response.data.data!;
  } catch (err) {
    unwrapApiError(err);
  }
}

// Delete KPI
export async function deleteKPI(id: string): Promise<void> {
  const response = await axios.delete<ApiResponse<null>>(`${API_BASE}/${id}`);
  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to delete KPI");
  }
}

// Weekly Values

// Upsert weekly value (create or update)
export async function updateWeeklyValue(kpiId: string, input: WeeklyValueInput): Promise<WeeklyValueResponse> {
  const response = await axios.post<ApiResponse<WeeklyValueResponse>>(`${API_BASE}/${kpiId}/weekly`, input);
  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to save weekly value");
  }
  return response.data.data!;
}

// Batch upsert — one network call for many (weekNumber, userId) rows.
// Returns per-input results; resolves even on partial failures so the UI can
// surface which rows didn't apply (permission denied / past-week gate / etc.).
export interface WeeklyValueBatchResult {
  weekNumber: number;
  userId: string;
  ok: boolean;
  error?: string;
}
export interface WeeklyValueBatchResponse {
  applied: number;
  failed: number;
  results: WeeklyValueBatchResult[];
}
export async function updateWeeklyValuesBatch(
  kpiId: string,
  inputs: WeeklyValueInput[],
): Promise<WeeklyValueBatchResponse> {
  const response = await axios.post<ApiResponse<WeeklyValueBatchResponse>>(
    `${API_BASE}/${kpiId}/weekly/batch`,
    { inputs },
  );
  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to save weekly values");
  }
  return response.data.data!;
}

// Get weekly values for a KPI
export async function getWeeklyValues(kpiId: string): Promise<WeeklyValueResponse[]> {
  const response = await axios.get<ApiResponse<WeeklyValueResponse[]>>(`${API_BASE}/${kpiId}/weekly`);
  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to fetch weekly values");
  }
  return response.data.data || [];
}

// Notes

// Add note to KPI
export async function addNote(kpiId: string, input: KPINoteInput): Promise<KPINoteResponse> {
  const response = await axios.post<ApiResponse<KPINoteResponse>>(`${API_BASE}/${kpiId}/notes`, input);
  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to add note");
  }
  return response.data.data!;
}

// Get notes for KPI
export async function getNotes(kpiId: string): Promise<KPINoteResponse[]> {
  const response = await axios.get<ApiResponse<KPINoteResponse[]>>(`${API_BASE}/${kpiId}/notes`);
  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to fetch notes");
  }
  return response.data.data || [];
}

// Delete note
export async function deleteNote(kpiId: string, noteId: string): Promise<void> {
  const response = await axios.delete<ApiResponse<null>>(`${API_BASE}/${kpiId}/notes/${noteId}`);
  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to delete note");
  }
}

// Audit Log

// Get audit log for KPI
export async function getLogs(kpiId: string): Promise<KPILogResponse[]> {
  const response = await axios.get<ApiResponse<KPILogResponse[]>>(`${API_BASE}/${kpiId}/logs`);
  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to fetch audit logs");
  }
  return response.data.data || [];
}
