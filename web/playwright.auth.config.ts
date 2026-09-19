import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-auth",
  workers: 2,
  use: { baseURL: "http://127.0.0.1:3102", trace: "retain-on-failure" },
  webServer: {
    command: "npm run start -- --port 3102",
    env: {
      ENABLE_GOOGLE_AUTH: "true",
      APP_URL: "http://127.0.0.1:3102",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "DEMO-publishable-key",
    },
    url: "http://127.0.0.1:3102/login",
    reuseExistingServer: false,
    timeout: 60000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
