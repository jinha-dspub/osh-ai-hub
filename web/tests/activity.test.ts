import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), rpc: vi.fn() }));
vi.mock("../lib/auth", () => ({ authClient: mock.client }));
vi.mock("../lib/admin", () => ({ isAdmin: mock.admin }));
import { POST } from "../app/api/activity/route";
import { GET } from "../app/api/admin/activity/route";
import { visitorPattern } from "../lib/activity";

function heartbeat(headers = {}, body?: string) {
  return new NextRequest("https://osh.example/api/activity", {
    method: "POST", headers: { origin: "https://osh.example", ...headers }, body,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://osh.example");
  mock.client.mockResolvedValue({ rpc: mock.rpc });
  mock.rpc.mockResolvedValue({ data: null, error: null });
});
describe("visit collection boundaries", () => {
  it("rejects missing/cross-site origins and injected identity/counts before any DB access", async () => {
    for (const origin of ["", "null", "https://attacker.invalid"])
      expect((await POST(heartbeat({ origin }))).status).toBe(403);
    expect((await POST(heartbeat({}, JSON.stringify({ user_id: "DEMO-admin", visits: 1000 })))).status).toBe(400);
    expect(mock.client).not.toHaveBeenCalled();
  });
  it("creates a protected random cookie and sends no identity or client time to SQL", async () => {
    const r = await POST(heartbeat());
    expect(r.status).toBe(204);
    const cookie = r.cookies.get("osh-visitor")!;
    expect(cookie.value).toMatch(visitorPattern);
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("record_site_visit", { p_visitor_id: cookie.value });
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("reuses the browser ID across reloads and rejects malformed cookie identifiers", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    await POST(heartbeat({ cookie: `osh-visitor=${id}` }));
    expect(mock.rpc).toHaveBeenLastCalledWith("record_site_visit", { p_visitor_id: id });
    const r = await POST(heartbeat({ cookie: "osh-visitor=DEMO-admin" }));
    expect(r.cookies.get("osh-visitor")?.value).toMatch(visitorPattern);
  });
  it("does not fabricate success or issue IDs when persistence is unavailable", async () => {
    mock.rpc.mockResolvedValue({ error: { message: "database detail must not leak" } });
    const r = await POST(heartbeat());
    expect(r.status).toBe(503);
    expect(r.cookies.get("osh-visitor")).toBeUndefined();
    expect(await r.text()).toBe("");
    mock.client.mockResolvedValue(null);
    expect((await POST(heartbeat())).status).toBe(503);
  });
});
describe("administrator activity endpoint", () => {
  it("rejects anonymous and ordinary sessions without querying activity data", async () => {
    mock.admin.mockResolvedValue(false);
    const r = await GET();
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(mock.client).not.toHaveBeenCalled();
  });
  it("serves only the guarded RPC and never caches user identities", async () => {
    mock.admin.mockResolvedValue(true);
    mock.rpc.mockResolvedValue({ data: { activeUsers: [{ email: "DEMO@example.invalid" }] }, error: null });
    const r = await GET();
    expect(r.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("site_activity_summary");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
  it("returns an explicit unavailable state without invented zero counters or database details", async () => {
    mock.admin.mockResolvedValue(true);
    mock.rpc.mockResolvedValue({ error: { message: "sensitive database detail" } });
    const r = await GET();
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("sensitive");
  });
});
