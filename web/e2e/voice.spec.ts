import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";

// Offline DEMO fixtures: these tests never contact a paid API or the real gateway.
test.beforeEach(async ({ page }) => {
  await page.route("**/demo/voice/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/api/")) {
      if (path.endsWith("/start")) return route.fulfill({ json: { token: "DEMO-fixture", max_seconds: 20 } });
      if (path.endsWith("/events")) return route.fulfill({ json: {
        ready: true, closed: true, events: [
          { id: 1, type: "text", text: "DEMO 테스트 답변입니다." },
          { id: 2, type: "search", total: 0, url: "/demo/copd/?q=DEMO" },
          { id: 3, type: "done" },
        ],
      } });
      return route.fulfill({ json: { ok: true } });
    }
    const file = path.includes("/assets/") ? `assets/${basename(path)}` : "index.html";
    const contentType = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".woff2") ? "font/woff2" : "text/html";
    return route.fulfill({ body: await readFile(resolve("../ai-api/static/voice", file)), contentType });
  });
});

test("voice demo requires consent, accepts text, shows transcript and actual search link", async ({ page }) => {
  await page.goto("/demo/voice/");
  await expect(page.getByRole("button", { name: "말로 질문하기" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /OpenAI로 전송/ }).check();
  await page.getByRole("textbox", { name: "글로 질문하기" }).fill("DEMO 질문");
  await page.getByRole("button", { name: "글로 질문 보내기" }).click();
  await expect(page.getByText("DEMO 테스트 답변입니다.")).toBeVisible();
  await expect(page.getByRole("link", { name: "COPD 검색 결과 0건 열기" })).toHaveAttribute("href", "/demo/copd/?q=DEMO");
  await expect(page.getByRole("button", { name: "말로 질문하기" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("exhausted budget is announced and direct search remains available", async ({ page }) => {
  await page.route("**/demo/voice/api/start", route => route.fulfill({ status: 429, json: { error: "오늘의 AI 이용 한도에 도달했습니다." } }));
  await page.goto("/demo/voice/");
  await page.getByRole("checkbox", { name: /OpenAI로 전송/ }).check();
  await page.getByRole("textbox", { name: "글로 질문하기" }).fill("DEMO 질문");
  await page.getByRole("button", { name: "글로 질문 보내기" }).click();
  await expect(page.getByRole("alert")).toContainText("한도에 도달");
  await expect(page.getByRole("link", { name: "COPD 직접 검색" })).toBeVisible();
});
