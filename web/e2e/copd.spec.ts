import { test, expect } from "@playwright/test";
test("COPD introduction explains the demo without inactive search controls", async ({
  page,
  request,
}) => {
  await page.goto("/tools");
  await expect(
    page.getByRole("link", { name: "COPD 검색 DEMO" }),
  ).toHaveAttribute("href", "/demo/copd/");
  await page.goto("/datasets/copd");
  await expect(page).toHaveURL(/\/datasets\/copd$/);
  await expect(
    page.getByRole("heading", { name: "COPD 산재 판정 사례", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("form")
      .getByRole("button", { name: "사례 검색", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("공개 전 검수 중입니다")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "사례 검색", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "이렇게 활용하세요" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "공개 판정문에 검색 가능한 구조를 더했습니다" })).toBeVisible();
  await expect(page.getByRole("link", { name: "COPD 검색 DEMO 열기" })).toHaveAttribute("href", "/demo/copd/");
  await page.getByRole("button", { name: "품질·한계", exact: true }).click();
  await expect(page.getByText("대조 가능한 사례 중 99.85%")).toBeVisible();
  await page.getByRole("button", { name: "파일·활용법", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "원본 다운로드 · 공개 검토 중" }),
  ).toHaveCount(0);
  await expect(page.getByText("Hugging Face 게시 계획 없음.")).toBeVisible();
  expect((await request.get("/api/copd?action=info")).status()).toBe(403);
  expect((await request.get("/api/copd?action=case&id=DEMO")).status()).toBe(
    403,
  );
  expect(
    (
      await request.post("/api/copd?action=search", { data: { q: "DEMO" } })
    ).status(),
  ).toBe(403);
  await page.screenshot({path: `test-results/copd-intro-${page.viewportSize()?.width}.png`, fullPage: true});
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
