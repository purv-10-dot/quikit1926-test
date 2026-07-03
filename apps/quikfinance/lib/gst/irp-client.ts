/**
 * IRP (Invoice Registration Portal) and NIC e-Way bill HTTP client.
 *
 * Government e-Invoice/e-Way APIs require a GSP (GST Suvidha Provider) or direct
 * sandbox account: client_id, client_secret, the org's API username/password,
 * and a base URL. These are read from environment variables. When they are not
 * configured, submission returns `{ status: "pending_credentials" }` and the
 * caller persists the built payload so it can be filed later — the payload is
 * complete and submission-ready. Wire the real GSP endpoints below once you
 * have credentials; the request/response shapes match the standard NIC/GSP API.
 */

export type IrpConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
};

export type PendingOrError = { status: "pending_credentials"; message: string } | { status: "error"; message: string };
export type EInvoiceResult = { status: "registered"; irn: string; ackNo: string; ackDate: string; signedQrCode: string; raw: unknown } | PendingOrError;
export type EWayResult = { status: "eway_generated"; ewayBillNo: string; ewayDate: string; validUntil: string; raw: unknown } | PendingOrError;
export type IrpResult = EInvoiceResult | EWayResult;

export function getIrpConfig(): IrpConfig | null {
  const baseUrl = process.env.GSP_BASE_URL;
  const clientId = process.env.GSP_CLIENT_ID;
  const clientSecret = process.env.GSP_CLIENT_SECRET;
  const username = process.env.GSP_USERNAME;
  const password = process.env.GSP_PASSWORD;
  if (!baseUrl || !clientId || !clientSecret || !username || !password) return null;
  return { baseUrl, clientId, clientSecret, username, password };
}

/**
 * Submit an e-Invoice payload to the IRP. With credentials configured this
 * POSTs to the GSP `/eivital/v1.04/invoice` endpoint; without them it returns a
 * pending status. The success-shape mapping mirrors the standard IRP response.
 */
export async function submitEInvoice(payload: Record<string, unknown>): Promise<EInvoiceResult> {
  const config = getIrpConfig();
  if (!config) {
    return { status: "pending_credentials", message: "GSTN/GSP credentials are not configured. The e-Invoice payload was built and saved; set GSP_* env vars to file it with the IRP." };
  }
  try {
    const response = await fetch(`${config.baseUrl}/eivital/v1.04/invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        user_name: config.username
      },
      body: JSON.stringify(payload)
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return { status: "error", message: `IRP returned ${response.status}: ${JSON.stringify(raw)}` };
    }
    const data = (raw.data ?? raw) as Record<string, unknown>;
    return {
      status: "registered",
      irn: String(data.Irn ?? ""),
      ackNo: String(data.AckNo ?? ""),
      ackDate: String(data.AckDt ?? ""),
      signedQrCode: String(data.SignedQRCode ?? ""),
      raw
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "IRP request failed." };
  }
}

/** Submit an e-Way bill payload to the NIC portal via the GSP `/ewaybillapi/v1.03/ewayapi`. */
export async function submitEWayBill(payload: Record<string, unknown>): Promise<EWayResult> {
  const config = getIrpConfig();
  if (!config) {
    return { status: "pending_credentials", message: "GSTN/NIC credentials are not configured. The e-Way bill payload was built and saved; set GSP_* env vars to generate it with NIC." };
  }
  try {
    const response = await fetch(`${config.baseUrl}/ewaybillapi/v1.03/ewayapi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        user_name: config.username
      },
      body: JSON.stringify(payload)
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return { status: "error", message: `NIC returned ${response.status}: ${JSON.stringify(raw)}` };
    }
    const data = (raw.data ?? raw) as Record<string, unknown>;
    return {
      status: "eway_generated",
      ewayBillNo: String(data.ewayBillNo ?? ""),
      ewayDate: String(data.ewayBillDate ?? ""),
      validUntil: String(data.validUpto ?? ""),
      raw
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "NIC request failed." };
  }
}
