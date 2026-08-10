import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LeadSquaredClient,
  LeadSquaredError,
} from "@/lib/services/leadsquared/client";

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const ATTRS = [{ Attribute: "EmailAddress", Value: "ada@x.com" }];

describe("LeadSquaredClient.createOrUpdateLead", () => {
  it("POSTs to the sync host with keys in headers and returns the ProspectId", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ Status: "Success", Message: { Id: "PID-1" } }));
    const client = new LeadSquaredClient({
      host: "https://api-in21.leadsquared.com",
      accessKey: "AK",
      secretKey: "SK",
      fetchImpl,
    });

    const result = await client.createOrUpdateLead(ATTRS);

    expect(result.prospectId).toBe("PID-1");
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://api-in21.leadsquared.com/v2/LeadManagement.svc/Lead.CreateOrUpdate?postUpdatedLead=false",
    );
    expect(opts.method).toBe("POST");
    expect(opts.headers["x-LSQ-AccessKey"]).toBe("AK");
    expect(opts.headers["x-LSQ-SecretKey"]).toBe("SK");
    expect(JSON.parse(opts.body)).toEqual(ATTRS);
  });

  it("extracts the ProspectId from the RelatedId shape too", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ Message: { RelatedId: "PID-2" } }));
    const client = new LeadSquaredClient({
      host: "https://h",
      accessKey: "AK",
      secretKey: "SK",
      fetchImpl,
    });
    expect((await client.createOrUpdateLead(ATTRS)).prospectId).toBe("PID-2");
  });

  it("throws LeadSquaredError with the status on a non-2xx response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ExceptionMessage: "bad key" }, { ok: false, status: 401 }));
    const client = new LeadSquaredClient({
      host: "https://h",
      accessKey: "AK",
      secretKey: "SK",
      fetchImpl,
    });
    await expect(client.createOrUpdateLead(ATTRS)).rejects.toMatchObject({
      name: "LeadSquaredError",
      status: 401,
    });
  });

  it("throws when a 200 response carries no ProspectId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ Status: "Success" }));
    const client = new LeadSquaredClient({
      host: "https://h",
      accessKey: "AK",
      secretKey: "SK",
      fetchImpl,
    });
    await expect(client.createOrUpdateLead(ATTRS)).rejects.toBeInstanceOf(
      LeadSquaredError,
    );
  });

  it("wraps a network/transport error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const client = new LeadSquaredClient({
      host: "https://h",
      accessKey: "AK",
      secretKey: "SK",
      fetchImpl,
    });
    await expect(client.createOrUpdateLead(ATTRS)).rejects.toMatchObject({
      name: "LeadSquaredError",
    });
  });
});

describe("LeadSquaredClient.fromEnv", () => {
  const KEYS = [
    "LEADSQUARED_HOST",
    "LEADSQUARED_ACCESS_KEY",
    "LEADSQUARED_SECRET_KEY",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("throws a clear error when credentials are missing", () => {
    delete process.env.LEADSQUARED_ACCESS_KEY;
    delete process.env.LEADSQUARED_SECRET_KEY;
    expect(() => LeadSquaredClient.fromEnv()).toThrow(/credentials missing/i);
  });

  it("builds a client when credentials are present", () => {
    process.env.LEADSQUARED_ACCESS_KEY = "AK";
    process.env.LEADSQUARED_SECRET_KEY = "SK";
    expect(LeadSquaredClient.fromEnv()).toBeInstanceOf(LeadSquaredClient);
  });
});

describe("LeadSquaredClient.getLeadByEmail", () => {
  it("returns the ProspectId of the first matching lead (GET by email)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse([{ ProspectID: "PID-9", EmailAddress: "ada@x.com" }]));
    const client = new LeadSquaredClient({ host: "https://h", accessKey: "AK", secretKey: "SK", fetchImpl });

    expect(await client.getLeadByEmail("ada@x.com")).toBe("PID-9");
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toContain("/v2/LeadManagement.svc/Leads.GetByEmailaddress?emailaddress=ada%40x.com");
    expect(opts.method).toBe("GET");
  });

  it("returns null when no lead matches", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const client = new LeadSquaredClient({ host: "https://h", accessKey: "AK", secretKey: "SK", fetchImpl });
    expect(await client.getLeadByEmail("nobody@x.com")).toBeNull();
  });
});

describe("LeadSquaredClient.updateLead", () => {
  it("POSTs the attributes to Lead.Update?leadId=<id> and echoes the id (no create/dedupe)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ Status: "Success" }));
    const client = new LeadSquaredClient({ host: "https://h", accessKey: "AK", secretKey: "SK", fetchImpl });

    const res = await client.updateLead("PID-7", ATTRS);

    expect(res.prospectId).toBe("PID-7");
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://h/v2/LeadManagement.svc/Lead.Update?leadId=PID-7");
    expect(opts.method).toBe("POST");
    // The id is in the query param — the body carries NO ProspectID attribute.
    expect(JSON.parse(opts.body)).toEqual(ATTRS);
  });

  it("prefers a ProspectId from the response envelope when present", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ Message: { Id: "PID-RESP" } }));
    const client = new LeadSquaredClient({ host: "https://h", accessKey: "AK", secretKey: "SK", fetchImpl });
    expect((await client.updateLead("PID-7", ATTRS)).prospectId).toBe("PID-RESP");
  });

  it("throws LeadSquaredError on a non-2xx response (surfaced to the outbound recovery)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ExceptionMessage: "nope" }, { ok: false, status: 500 }));
    const client = new LeadSquaredClient({ host: "https://h", accessKey: "AK", secretKey: "SK", fetchImpl });
    await expect(client.updateLead("PID-7", ATTRS)).rejects.toMatchObject({
      name: "LeadSquaredError",
      status: 500,
    });
  });
});

describe("LeadSquaredClient.getRecentlyModifiedLeads", () => {
  it("POSTs to Leads.RecentlyModified with account-TZ dates and returns flat leads", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ Leads: [{ ProspectID: "P1", ProspectStage: "New Lead" }] }));
    const client = new LeadSquaredClient({ host: "https://h", accessKey: "AK", secretKey: "SK", fetchImpl });

    const leads = await client.getRecentlyModifiedLeads(
      new Date("2026-07-20T00:00:00.000Z"),
      new Date("2026-07-20T00:10:00.000Z"),
      { tzOffsetMinutes: 330, pageSize: 50 },
    );

    expect(leads).toEqual([{ ProspectID: "P1", ProspectStage: "New Lead" }]);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://h/v2/LeadManagement.svc/Leads.RecentlyModified");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.Parameter.FromDate).toBe("2026-07-20 05:30:00"); // +330 min (IST)
    expect(body.Parameter.ToDate).toBe("2026-07-20 05:40:00");
    expect(body.Paging.PageSize).toBe(50);
  });

  it("flattens a LeadPropertyList response into a flat lead object", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        Leads: [
          {
            LeadPropertyList: [
              { Attribute: "ProspectID", Value: "P2" },
              { Attribute: "ProspectStage", Value: "Demo Scheduled" },
            ],
          },
        ],
      }),
    );
    const client = new LeadSquaredClient({ host: "https://h", accessKey: "AK", secretKey: "SK", fetchImpl });
    const leads = await client.getRecentlyModifiedLeads(new Date(), new Date());
    expect(leads).toEqual([{ ProspectID: "P2", ProspectStage: "Demo Scheduled" }]);
  });
});
