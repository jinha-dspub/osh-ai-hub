import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import release from "../lib/opendata-kit-release.json";

test("collaborators can discover and download the documentation kit", async ({
  page,
  request,
}, info) => {
  await page.goto("/datasets");
  await page.getByRole("radio", { name: "데이터 제작 가이드" }).check();
  await page.getByRole("button", { name: "필터 적용" }).click();
  await expect(page.locator(".dataset-card")).toHaveCount(1);
  await expect(page.locator(".dataset-card")).toContainText("공개 제작 양식");
  await page
    .getByRole("heading", { name: "데이터 제작 가이드" })
    .getByRole("link")
    .click();
  await expect(page.locator("h1")).toHaveText("데이터 제작 가이드");
  await expect(
    page.getByText("동봉한 requirements.txt는 주석만 있는 작성 양식입니다.", {
      exact: false,
    }),
  ).toBeVisible();
  const download = page.getByRole("link", {
    name: "제작 가이드·템플릿 다운로드 (ZIP)",
  });
  await expect(download).toHaveAttribute("href", release.url);
  const response = await request.get(release.url);
  expect(response.status()).toBe(200);
  const bytes = await response.body();
  expect(bytes.length).toBe(release.bytes);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(release.sha256);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/opendata-guide-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "OSH Family Design 보기" }).click();
  await expect(page.locator("h1")).toHaveText("OSH Family Design");
});
