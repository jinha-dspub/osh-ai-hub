import { afterEach, describe, expect, it, vi } from "vitest";
import { copdRequestAllowed, internalCopdEnabled } from "../lib/copd-access";
afterEach(() => vi.unstubAllEnvs());
describe("COPD private preview", () => {
  function configure() {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COPD_INTERNAL_PREVIEW", "true");
    vi.stubEnv("COPD_API_TOKEN", "DEMO-test-token-".repeat(4));
  }
  it("requires opt-in and a server token", () => {
    vi.stubEnv("COPD_INTERNAL_PREVIEW", "false");
    expect(internalCopdEnabled()).toBe(false);
    configure();
    expect(internalCopdEnabled()).toBe(true);
    vi.stubEnv("COPD_API_TOKEN", "");
    expect(internalCopdEnabled()).toBe(false);
  });
  it("always denies production even when configured", () => {
    configure();
    vi.stubEnv("NODE_ENV", "production");
    expect(copdRequestAllowed("http://localhost/api/copd", null, "GET")).toBe(
      false,
    );
  });
  it("denies remote hosts and cross-origin AI requests", () => {
    configure();
    expect(
      copdRequestAllowed(
        "http://localhost:3100/api/copd",
        "http://localhost:3100",
        "POST",
      ),
    ).toBe(true);
    expect(
      copdRequestAllowed("http://localhost:3100/api/copd", null, "POST"),
    ).toBe(false);
    expect(
      copdRequestAllowed(
        "http://localhost:3100/api/copd",
        "https://evil.example",
        "POST",
      ),
    ).toBe(false);
    expect(copdRequestAllowed("https://osh.ai.kr/api/copd", null, "GET")).toBe(
      false,
    );
  });
});
