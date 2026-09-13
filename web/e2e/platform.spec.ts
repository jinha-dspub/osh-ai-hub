import { test, expect } from "@playwright/test";
test("search, filter, inspect a dataset and download real sample bytes", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "더 안전한 내일",
  );
  await page.getByRole("textbox", { name: "데이터 검색어" }).fill("직업성 암");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "업종별 직업성 암 분석 데이터" }),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "업종별 직업성 암 분석 데이터" })
    .getByRole("link")
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "업종별 직업성 암 분석 데이터",
  );
  await page.getByRole("link", { name: "파일 다운로드", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "다운로드", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    "occupational-cancer-DEMO.csv",
  );
  const response = await request.get("/api/samples/occupational-cancer");
  expect(response.headers()["x-checksum-sha256"]).toMatch(/^[a-f0-9]{64}$/);
  expect(await response.text()).toContain('"industry"');
});
test("filters remain in URL and empty results can be reset", async ({
  page,
}) => {
  await page.goto("/datasets");
  await page.getByRole("radio", { name: "산업재해" }).check();
  await page.getByRole("checkbox", { name: "샘플 API 제공" }).check();
  await page.getByRole("checkbox", { name: "AI 학습 데이터 예제" }).check();
  await page.getByRole("button", { name: "필터 적용" }).click();
  await expect(page).toHaveURL(/ai=true/);
  await expect(page.locator(".dataset-card")).toHaveCount(1);
  await page.goto("/datasets?q=unmatchedzzzz");
  await expect(page.getByText("조건에 맞는 데이터가 없어요")).toBeVisible();
  await page.getByRole("link", { name: "전체 데이터 보기" }).click();
  await expect(page.locator(".dataset-card")).toHaveCount(12);
});
test("API explorer makes an actual request and language tabs work", async ({
  page,
}) => {
  await page.goto("/developers");
  await page.getByRole("button", { name: "R", exact: true }).click();
  await expect(page.locator(".code-panel pre")).toContainText("library(httr2)");
  await page.getByRole("button", { name: "API 실행", exact: true }).click();
  await expect(page.locator(".response-caption")).toContainText("200 OK");
  await expect(page.locator(".response-box")).toContainText('"is_demo": true');
});
test("API validation and unknown files fail closed", async ({ request }) => {
  expect((await request.get("/openapi/v1/datasets?limit=1000")).status()).toBe(
    400,
  );
  expect(
    (await request.get("/openapi/v1/statistics/construction-ppe")).status(),
  ).toBe(404);
  expect(
    (
      await request.get("/openapi/v1/statistics/occupational-cancer?year=2025")
    ).status(),
  ).toBe(400);
  const response = await request.get(
    "/openapi/v1/statistics/industrial-accidents?year=2025",
  );
  expect((await response.json()).data).toHaveLength(2);
  expect((await request.get("/api/samples/missing")).status()).toBe(404);
  expect((await request.get("/openapi.json")).status()).toBe(200);
});
test("unconfigured login and API keys do not pretend to work", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeDisabled();
  expect((await request.post("/auth/google")).status()).toBe(503);
  await page.goto("/account/api-keys");
  await expect(page.getByRole("button", { name: "새 API 키" })).toBeDisabled();
  await expect(
    page.getByText("개인 API 워크스페이스를 준비 중이에요"),
  ).toBeVisible();
});
test("all primary pages render without client errors or horizontal overflow", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of [
    "/",
    "/datasets",
    "/datasets/construction-ppe",
    "/models",
    "/models/ppe-detector",
    "/tools",
    "/developers",
    "/apis",
    "/login",
    "/account/usage",
    "/playground",
    "/about",
  ]) {
    const result = await page.goto(path);
    expect(result?.status(), path).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `overflow ${path}`,
    ).toBe(true);
  }
  expect(errors).toEqual([]);
  await page.goto("/");
  await page.screenshot({
    path: `test-results/home-${info.project.name}.png`,
    fullPage: true,
  });
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "메뉴 열기" }).click();
    await page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "AI 모델" })
      .click();
    await expect(page).toHaveURL(/\/models$/);
  }
});
