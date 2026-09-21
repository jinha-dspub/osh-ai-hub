import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:3101", trace: "retain-on-failure" },
  webServer: {
    command: "npm run build:copd-demo && npm run build:oshmaster-demo && npm run build:voice-demo && npm run start -- --port 3101",
    env: { ENABLE_GOOGLE_AUTH: "false" },
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 60000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
