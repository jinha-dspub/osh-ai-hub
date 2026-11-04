import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "activity.spec.ts", workers: 1,
  use: { baseURL: "http://127.0.0.1:3114", trace: "retain-on-failure" },
  webServer: {
    command: "node scripts/serve-activity-preview.mjs",
    url: "http://127.0.0.1:3114", reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 800 } } },
  ],
});
