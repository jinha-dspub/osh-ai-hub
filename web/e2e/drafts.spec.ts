import { test, expect } from "@playwright/test";

test("visitors see working tools without draft cards or navigation", async ({
  page,
}) => {
  await page.goto("/tools?admin=true");
  await expect(
    page.getByRole("link", { name: "한글 변환기 바로가기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "건강검진 확인 바로가기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "COPD 검색 DEMO" }),
  ).toBeVisible();
  for (const text of [
    "직업 코호트 SIR 대시보드",
    "업종별 암발생 탐색기",
    "R 기반 분석 도구",
    "이미지 AI Playground",
    "연결 준비 중",
  ]) {
    await expect(page.getByText(text, { exact: false })).toHaveCount(0);
  }
  await expect(
    page.locator(
      'a[href="/models"], a[href="/admin/drafts"], a[href="/login"]',
    ),
  ).toHaveCount(0);
  await page.goto("/apis");
  await expect(
    page.getByRole("heading", { name: "이미지 추론 API" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "데이터 카탈로그 API" }),
  ).toBeVisible();
  await page.goto("/developers");
  await expect(page.locator('a[href^="/account/"]')).toHaveCount(0);
});

test("draft URLs and forged admin flags never reveal draft content", async ({
  request,
}) => {
  for (const path of [
    "/admin/drafts",
    "/models",
    "/models/ppe-detector",
    "/playground",
    "/account/api-keys",
    "/account/usage",
  ]) {
    const response = await request.get(path + "?admin=true", {
      headers: { "X-Role": "admin", Cookie: "role=admin; isAdmin=true" },
    });
    expect(response.status(), path).toBe(404);
    expect(await response.text()).not.toContain("DEMO MODEL CARD");
    expect(await response.text()).not.toContain("새 API 키");
  }
});
