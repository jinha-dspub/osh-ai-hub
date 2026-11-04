import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "life-years.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3102", trace: "retain-on-failure" },
  webServer: [
    {
      command:
        "../ai-api/.venv/bin/python -m uvicorn app.demo_gateway:app --app-dir ../ai-api --host 127.0.0.1 --port 8113 --no-access-log",
      env: { COPD_ALLOW_LOCAL_PREVIEW: "true" },
      url: "http://127.0.0.1:8113/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run start -- --port 3102",
      env: { ENABLE_GOOGLE_AUTH: "false" },
      url: "http://127.0.0.1:3102",
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 800 } },
    },
  ],
});
