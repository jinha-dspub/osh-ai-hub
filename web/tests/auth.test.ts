import { afterEach, describe, expect, it, vi } from "vitest";
import { authConfigured } from "../lib/auth";

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
