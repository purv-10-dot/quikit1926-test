import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getActionExecutor } from "@/lib/engine/actions";
import type { ActionContext } from "@/lib/engine/types";

function ctx(actionId: string, data: Record<string, unknown>): ActionContext {
  return {
    orgId: "org_A",
    workflowId: "wf1",
    runId: "run1",
    event: { app: "quikscale", event: "kpi.below_target", orgId: "org_A", dedupeKey: "k", data },
    node: { id: "a1", kind: "action", label: "L", config: { actionId } },
  };
}

const KPI_DATA = { kpiId: "k1", name: "MRR", value: 1, target: 8, ownerId: "u_owner", quarter: "Q2", year: 2026 };

beforeEach(() => {
  process.env.QUIKSCALE_URL = "http://quikscale.test";
  process.env.INTERNAL_SECRET = "secret";
});
afterEach(() => vi.restoreAllMocks());

describe("real action executors", () => {
  it("create_priority calls the QuikScale internal endpoint with derived fields", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, json: async () => ({ success: true, data: { id: "prio_1" } }) }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await getActionExecutor("create_priority")(ctx("create_priority", KPI_DATA));
    expect(res.status).toBe("ok");
    expect(res.output?.priorityId).toBe("prio_1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://quikscale.test/api/internal/actions/create-priority");
    expect((init as { headers: Record<string, string> }).headers["x-internal-secret"]).toBe("secret");
    const body = JSON.parse((init as { body: string }).body);
    expect(body.orgId).toBe("org_A");
    expect(body.owner).toBe("u_owner");
    expect(body.name).toBe("Recover KPI: MRR");
    expect(body.quarter).toBe("Q2");
  });

  it("notify_owner posts a notification for the owner", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, json: async () => ({ success: true, data: { id: "notif_1" } }) }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await getActionExecutor("notify_owner")(ctx("notify_owner", KPI_DATA));
    expect(res.status).toBe("ok");
    expect(res.output?.notificationId).toBe("notif_1");
    expect(fetchMock.mock.calls[0][0]).toBe("http://quikscale.test/api/internal/actions/notify");
  });

  it("skips cleanly (no fetch) when the event has no KPI context (e.g. manual Run now)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await getActionExecutor("create_priority")(ctx("create_priority", { manual: true }));
    expect(res.status).toBe("ok");
    expect(res.output?.skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails the step when QuikScale rejects the call", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: false, status: 500, json: async () => ({ success: false, error: "boom" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await getActionExecutor("create_priority")(ctx("create_priority", KPI_DATA));
    expect(res.status).toBe("failed");
    expect(res.error).toBe("boom");
  });

  it("still simulates an unmapped action id", async () => {
    const res = await getActionExecutor("notify.slack.send")(ctx("notify.slack.send", KPI_DATA));
    expect(res.status).toBe("ok");
    expect(res.output?.simulated).toBe(true);
  });
});
