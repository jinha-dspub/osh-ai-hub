import { afterEach, describe, expect, it, vi } from "vitest";
import { authConfigured, appOrigin, safeReturnPath } from "../lib/auth-config";

afterEach(() => vi.unstubAllEnvs());
describe("demo authentication boundary", () => {
  it("does not activate Google merely because cloud credentials exist", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    vi.stubEnv("APP_URL", "https://example.vercel.app");
    vi.stubEnv("ENABLE_GOOGLE_AUTH", "false");
    expect(authConfigured()).toBe(false);
    vi.stubEnv("ENABLE_GOOGLE_AUTH", "true");
    expect(authConfigured()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(authConfigured()).toBe(false);
  });
});

describe("safe authentication destinations", () => {
  it("keeps only local return paths", () => {
    for (const path of [
      null,
      "https://evil.example",
      "//evil.example",
      "/%2fevil.example",
      "/%5cevil.example",
      "/%252fevil.example",
      "/auth/logout",
      "/login",
      "/../login",
      "/bad%00path",
      "/%zz",
    ])
      expect(safeReturnPath(path)).toBe("/account");
    expect(safeReturnPath("/datasets/copd?tab=files#download")).toBe(
      "/datasets/copd?tab=files#download",
    );
  });
  it("rejects malformed and insecure deployment origins", () => {
    for (const value of [
      "not-a-url",
      "http://osh.ai.kr",
      "https://osh.ai.kr/extra",
      "https://user:password@osh.ai.kr",
    ]) {
      vi.stubEnv("APP_URL", value);
      expect(appOrigin()).toBeNull();
    }
    vi.stubEnv("APP_URL", "http://localhost:3100");
    expect(appOrigin()).toBe("http://localhost:3100");
  });
});
