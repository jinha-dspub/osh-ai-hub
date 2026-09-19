import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
import { proxy } from "../proxy";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe("session refresh boundary", () => {
  it("propagates rotated cookies to the request and browser without CDN caching", async () => {
    vi.stubEnv("ENABLE_GOOGLE_AUTH", "true");
    vi.stubEnv("APP_URL", "https://osh.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://DEMO.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "DEMO-publishable");
    const verify = vi.fn();
    mocks.create.mockImplementation((_url, _key, options) => {
      verify.mockImplementation(async () => {
        options.cookies.setAll([
          {
            name: "sb-DEMO-auth-token",
            value: "DEMO-rotated",
            options: {
              httpOnly: true,
              secure: true,
              sameSite: "lax",
              path: "/",
            },
          },
        ]);
        options.cookies.setAll([
          { name: "sb-DEMO-auth-token.1", value: "", options: { maxAge: 0 } },
        ]);
        return { data: { user: null }, error: null };
      });
      return { auth: { getUser: verify } };
    });
    const request = new NextRequest("https://osh.example/account", {
      headers: { cookie: "sb-DEMO-auth-token=DEMO-expired" },
    });
    const response = await proxy(request);
    expect(verify).toHaveBeenCalledOnce();
    expect(request.cookies.get("sb-DEMO-auth-token")?.value).toBe(
      "DEMO-rotated",
    );
    expect(response.cookies.get("sb-DEMO-auth-token")?.value).toBe(
      "DEMO-rotated",
    );
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "DEMO-rotated",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("does not create an auth client when disabled", async () => {
    vi.stubEnv("ENABLE_GOOGLE_AUTH", "false");
    await proxy(new NextRequest("https://osh.example/"));
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
