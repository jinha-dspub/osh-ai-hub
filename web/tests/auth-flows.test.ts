import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({
  client: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  oauth: vi.fn(),
  exchange: vi.fn(),
  user: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("../lib/auth", () => ({ authClient: mock.client }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mock.get, set: mock.set }),
}));
import { POST as start } from "../app/auth/google/route";
import { GET as callback } from "../app/auth/callback/route";
import { POST as logout } from "../app/auth/logout/route";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://osh.example");
  mock.client.mockResolvedValue({
    auth: {
      signInWithOAuth: mock.oauth,
      exchangeCodeForSession: mock.exchange,
      getUser: mock.user,
      signOut: mock.logout,
    },
  });
  mock.oauth.mockResolvedValue({
    data: { url: "https://DEMO.supabase.co/auth/v1/authorize?provider=google" },
    error: null,
  });
  mock.exchange.mockResolvedValue({ error: null });
  mock.user.mockResolvedValue({
    data: { user: { id: "DEMO-user" } },
    error: null,
  });
  mock.logout.mockResolvedValue({ error: null });
});
function post(
  path: string,
  origin = "https://osh.example",
  next = "/datasets/copd",
) {
  return new NextRequest(`https://osh.example/auth/${path}`, {
    method: "POST",
    headers: { origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ next }),
  });
}
describe("Google authentication boundaries (DEMO unit fixtures)", () => {
  it("refuses cross-origin and missing-origin login/logout before mutation", async () => {
    for (const origin of ["https://attacker.example", "null", ""]) {
      expect((await start(post("google", origin))).status).toBe(403);
      expect((await logout(post("logout", origin))).status).toBe(403);
    }
    expect(mock.oauth).not.toHaveBeenCalled();
    expect(mock.logout).not.toHaveBeenCalled();
  });
  it("starts only Google and stores a safe return path with protected cookies", async () => {
    const response = await start(post("google"));
    expect(response.status).toBe(303);
    expect(mock.oauth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: "https://osh.example/auth/callback",
          scopes: "openid email profile",
        }),
      }),
    );
    expect(mock.set).toHaveBeenCalledWith(
      "osh-auth-return",
      "/datasets/copd",
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 900,
      }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("callback verifies the exchanged session and ignores injected next parameters", async () => {
    mock.get.mockReturnValue({ value: "/datasets/copd" });
    const response = await callback(
      new NextRequest(
        "https://osh.example/auth/callback?code=DEMO-code&next=https://attacker.example",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://osh.example/datasets/copd",
    );
    expect(mock.exchange).toHaveBeenCalledWith("DEMO-code");
    expect(mock.user).toHaveBeenCalledOnce();
    expect(mock.set).toHaveBeenCalledWith(
      "osh-auth-return",
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
  });
  it("rejects forged return cookies and never reports success for a failed verification", async () => {
    mock.get.mockReturnValue({ value: "//attacker.example" });
    expect(
      (
        await callback(
          new NextRequest("https://osh.example/auth/callback?code=DEMO-code"),
        )
      ).headers.get("location"),
    ).toBe("https://osh.example/account");
    mock.user.mockResolvedValue({
      data: { user: null },
      error: { message: "DEMO secret" },
    });
    const response = await callback(
      new NextRequest("https://osh.example/auth/callback?code=DEMO-code"),
    );
    expect(response.headers.get("location")).toBe(
      "https://osh.example/login?error=callback",
    );
    expect(await response.text()).not.toContain("DEMO secret");
  });
  it("handles cancellation and missing/replayed codes without trusting provider text", async () => {
    for (const query of [
      "",
      "?error=access_denied&error_description=DEMO-secret",
    ]) {
      const response = await callback(
        new NextRequest("https://osh.example/auth/callback" + query),
      );
      expect(response.headers.get("location")).toMatch(/\/login\?error=/);
      expect(response.headers.get("location")).not.toContain("DEMO-secret");
    }
    expect(mock.exchange).not.toHaveBeenCalled();
    mock.exchange.mockResolvedValue({ error: { message: "replayed" } });
    expect(
      (
        await callback(
          new NextRequest(
            "https://osh.example/auth/callback?code=DEMO-replayed",
          ),
        )
      ).headers.get("location"),
    ).toContain("error=callback");
    expect(mock.user).not.toHaveBeenCalled();
  });
  it("logs out this session only and preserves the error state on failure", async () => {
    expect((await logout(post("logout"))).headers.get("location")).toBe(
      "https://osh.example/login?logged_out=1",
    );
    expect(mock.logout).toHaveBeenCalledWith({ scope: "local" });
    mock.logout.mockResolvedValue({ error: { message: "DEMO error" } });
    expect((await logout(post("logout"))).headers.get("location")).toBe(
      "https://osh.example/account?error=logout",
    );
  });
  it("does not enable auth when configuration is missing", async () => {
    mock.client.mockResolvedValue(null);
    expect((await start(post("google"))).status).toBe(503);
    expect((await logout(post("logout"))).status).toBe(503);
    expect(
      (await callback(new NextRequest("https://osh.example/auth/callback")))
        .status,
    ).toBe(503);
  });
});
