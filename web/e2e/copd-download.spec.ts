import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";

test.beforeEach(async ({ page }) => {
  await page.route("**/demo/copd/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/api")) {
      const action = url.searchParams.get("action");
      if (action === "info") return route.fulfill({ json: { occupations: [] } });
      if (action === "files") return route.fulfill({ json: { version: "DEMO", files: [{ id: "source", name: "DEMO-source.zip", bytes: 12, sha256: "a".repeat(64) }] } });
      if (action === "download") return route.fulfill({ json: { url: "https://demo.supabase.co/storage/v1/object/sign/copd-research/DEMO-source.zip?token=DEMO", expires_in: 60 } });
      return route.fulfill({ status: 400, json: { error: "DEMO unsupported request" } });
    }
    const file = url.pathname.includes("/assets/") ? `assets/${basename(url.pathname)}` : "index.html";
    return route.fulfill({ body: await readFile(resolve("../ai-api/static/copd", file)), contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html" });
  });
});

test("authorized review UI downloads directly from object storage", async ({ page }) => {
  await page.route("https://demo.supabase.co/**", route => route.fulfill({ body: "DEMO fixture", headers: { "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="DEMO-source.zip"' } }));
  await page.goto("/demo/copd/?tab=files");
  const button = page.getByRole("button", { name: "DEMO-source.zip 다운로드" });
  await expect(button).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await button.click();
  expect((await downloaded).suggestedFilename()).toBe("DEMO-source.zip");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("download errors remain visible and can be retried", async ({ page }) => {
  await page.route("**/api?action=download", route => route.fulfill({ status: 503, json: { error: "저장소 연결을 확인해 주세요." } }));
  await page.goto("/demo/copd/?tab=files");
  const button = page.getByRole("button", { name: "DEMO-source.zip 다운로드" });
  await button.click();
  await expect(page.getByRole("alert")).toContainText("저장소 연결");
  await expect(button).toBeEnabled();
});
