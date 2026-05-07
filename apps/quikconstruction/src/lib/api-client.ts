/**
 * QuikConstruction — API Client
 *
 * Typed fetch wrapper for all construction API routes.
 * Follows the same pattern as QuikScale's API client.
 */

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
};

async function request<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, params } = opts;

  let fullUrl = url;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) searchParams.set(k, String(v));
    }
    const qs = searchParams.toString();
    if (qs) fullUrl += `?${qs}`;
  }

  const res = await fetch(fullUrl, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, error.message ?? "Request failed", error);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Master Data APIs ───────────────────────────────────────────────

export const mastersApi = {
  // Projects
  listProjects: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/masters/projects", { params }),
  getProject: (id: string) =>
    request<any>(`/api/masters/projects/${id}`),
  createProject: (data: any) =>
    request<any>("/api/masters/projects", { method: "POST", body: data }),
  updateProject: (id: string, data: any) =>
    request<any>(`/api/masters/projects/${id}`, { method: "PUT", body: data }),

  // Items
  listItems: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/masters/items", { params }),
  getItem: (id: string) =>
    request<any>(`/api/masters/items/${id}`),
  createItem: (data: any) =>
    request<any>("/api/masters/items", { method: "POST", body: data }),
  updateItem: (id: string, data: any) =>
    request<any>(`/api/masters/items/${id}`, { method: "PUT", body: data }),

  // Item Groups
  listItemGroups: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/masters/item-groups", { params }),
  createItemGroup: (data: any) =>
    request<any>("/api/masters/item-groups", { method: "POST", body: data }),
  updateItemGroup: (id: string, data: any) =>
    request<any>(`/api/masters/item-groups/${id}`, { method: "PUT", body: data }),

  // Vendors
  listVendors: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/masters/vendors", { params }),
  getVendor: (id: string) =>
    request<any>(`/api/masters/vendors/${id}`),
  createVendor: (data: any) =>
    request<any>("/api/masters/vendors", { method: "POST", body: data }),
  updateVendor: (id: string, data: any) =>
    request<any>(`/api/masters/vendors/${id}`, { method: "PUT", body: data }),

  // Contractors
  listContractors: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/masters/contractors", { params }),
  createContractor: (data: any) =>
    request<any>("/api/masters/contractors", { method: "POST", body: data }),
  updateContractor: (id: string, data: any) =>
    request<any>(`/api/masters/contractors/${id}`, { method: "PUT", body: data }),

  // Locations
  listLocations: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/masters/locations", { params }),
  createLocation: (data: any) =>
    request<any>("/api/masters/locations", { method: "POST", body: data }),
  updateLocation: (id: string, data: any) =>
    request<any>(`/api/masters/locations/${id}`, { method: "PUT", body: data }),

  // UOM
  listUOMs: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/masters/uom", { params }),
  createUOM: (data: any) =>
    request<any>("/api/masters/uom", { method: "POST", body: data }),

  // Customers
  listCustomers: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/masters/customers", { params }),
  createCustomer: (data: any) =>
    request<any>("/api/masters/customers", { method: "POST", body: data }),
  updateCustomer: (id: string, data: any) =>
    request<any>(`/api/masters/customers/${id}`, { method: "PUT", body: data }),

  // Machinery
  listMachinery: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/masters/machinery", { params }),
  createMachinery: (data: any) =>
    request<any>("/api/masters/machinery", { method: "POST", body: data }),
  updateMachinery: (id: string, data: any) =>
    request<any>(`/api/masters/machinery/${id}`, { method: "PUT", body: data }),

  // Generic master
  listMaster: (masterType: string, params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>(`/api/masters/${masterType}`, { params }),
  createMaster: (masterType: string, data: any) =>
    request<any>(`/api/masters/${masterType}`, { method: "POST", body: data }),
  updateMaster: (masterType: string, id: string, data: any) =>
    request<any>(`/api/masters/${masterType}/${id}`, { method: "PUT", body: data }),
};

// ─── Purchase APIs ──────────────────────────────────────────────────

export const purchaseApi = {
  // Purchase Requisitions
  listPRs: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/purchase/requisitions", { params }),
  getPR: (id: string) =>
    request<any>(`/api/purchase/requisitions/${id}`),
  createPR: (data: any) =>
    request<any>("/api/purchase/requisitions", { method: "POST", body: data }),
  updatePR: (id: string, data: any) =>
    request<any>(`/api/purchase/requisitions/${id}`, { method: "PUT", body: data }),

  // Indents
  listIndents: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/purchase/indents", { params }),
  getIndent: (id: string) =>
    request<any>(`/api/purchase/indents/${id}`),
  createIndent: (data: any) =>
    request<any>("/api/purchase/indents", { method: "POST", body: data }),

  // Purchase Orders
  listPOs: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/purchase/orders", { params }),
  getPO: (id: string) =>
    request<any>(`/api/purchase/orders/${id}`),
  createPO: (data: any) =>
    request<any>("/api/purchase/orders", { method: "POST", body: data }),

  // GRN
  listGRNs: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/purchase/grn", { params }),
  getGRN: (id: string) =>
    request<any>(`/api/purchase/grn/${id}`),
  createGRN: (data: any) =>
    request<any>("/api/purchase/grn", { method: "POST", body: data }),
};

// ─── Store APIs ─────────────────────────────────────────────────────

export const storeApi = {
  getStockRegister: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/store/stock-register", { params }),
  getStockLedger: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/store/ledger", { params }),

  listIssues: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/store/issues", { params }),
  createIssue: (data: any) =>
    request<any>("/api/store/issues", { method: "POST", body: data }),

  listGatePasses: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/store/gate-passes", { params }),
  createGatePass: (data: any) =>
    request<any>("/api/store/gate-passes", { method: "POST", body: data }),

  listTransfers: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/store/transfers", { params }),
  createTransfer: (data: any) =>
    request<any>("/api/store/transfers", { method: "POST", body: data }),
  receiveTransfer: (id: string, data: any) =>
    request<any>(`/api/store/transfers/${id}/receive`, { method: "POST", body: data }),

  listDieselLogs: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/store/diesel-logs", { params }),
  createDieselLog: (data: any) =>
    request<any>("/api/store/diesel-logs", { method: "POST", body: data }),
};

// ─── Project APIs ───────────────────────────────────────────────────

export const projectApi = {
  listBOQ: (projectId: string) =>
    request<{ data: any[] }>(`/api/projects/${projectId}/boq`),
  importBOQ: (projectId: string, data: any) =>
    request<any>(`/api/projects/${projectId}/boq/import`, { method: "POST", body: data }),

  listEstimations: (projectId: string) =>
    request<{ data: any[] }>(`/api/projects/${projectId}/estimations`),
  createEstimation: (projectId: string, data: any) =>
    request<any>(`/api/projects/${projectId}/estimations`, { method: "POST", body: data }),

  listWorkOrders: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/projects/work-orders", { params }),
  getWorkOrder: (id: string) =>
    request<any>(`/api/projects/work-orders/${id}`),
  createWorkOrder: (data: any) =>
    request<any>("/api/projects/work-orders", { method: "POST", body: data }),

  listDPRs: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/projects/dpr", { params }),
  getDPR: (id: string) =>
    request<any>(`/api/projects/dpr/${id}`),
  createDPR: (data: any) =>
    request<any>("/api/projects/dpr", { method: "POST", body: data }),
  submitDPR: (id: string) =>
    request<any>(`/api/projects/dpr/${id}/submit`, { method: "POST" }),

  listRABs: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/projects/rab", { params }),
  createRAB: (data: any) =>
    request<any>("/api/projects/rab", { method: "POST", body: data }),
};

// ─── Approval APIs ──────────────────────────────────────────────────

export const approvalApi = {
  listPending: (params?: Record<string, string>) =>
    request<{ data: any[]; total: number }>("/api/approvals/pending", { params }),
  approve: (instanceId: string, data: { comments?: string }) =>
    request<any>(`/api/approvals/${instanceId}/approve`, { method: "POST", body: data }),
  reject: (instanceId: string, data: { comments: string }) =>
    request<any>(`/api/approvals/${instanceId}/reject`, { method: "POST", body: data }),
  returnForRevision: (instanceId: string, data: { comments: string }) =>
    request<any>(`/api/approvals/${instanceId}/return`, { method: "POST", body: data }),
  getHistory: (instanceId: string) =>
    request<{ data: any[] }>(`/api/approvals/${instanceId}/history`),
};

// ─── Dashboard APIs ─────────────────────────────────────────────────

export const dashboardApi = {
  getOverview: (params?: Record<string, string>) =>
    request<any>("/api/dashboard/overview", { params }),
  getProjectSummary: (projectId: string) =>
    request<any>(`/api/dashboard/project/${projectId}`),
};
