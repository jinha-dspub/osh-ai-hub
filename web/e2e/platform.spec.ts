import { test, expect } from "@playwright/test";
test("public home and catalog show published resources, with working search", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".dataset-card")).toHaveCount(3);
  await expect(
    page.locator(".dataset-card").filter({ hasText: "COPD 산재 판정 사례" }),
  ).toHaveCount(1);
  await expect(page.getByText("건설현장 안전보호구 이미지")).toHaveCount(0);
  await page.getByRole("textbox", { name: "데이터 검색어" }).fill("COPD");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.locator(".dataset-card")).toHaveCount(1);
  await page
    .getByRole("heading", { name: "COPD 산재 판정 사례" })
    .getByRole("link")
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "COPD 산재 판정 사례",
  );
  await expect(
    page.getByRole("link", { name: "COPD 검색 DEMO 열기" }),
  ).toHaveAttribute("href", "/demo/copd/");
});
test("catalog filters preserve URL and empty results can be reset", async ({
  page,
}) => {
  await page.goto("/datasets");
  await page.getByRole("radio", { name: "산업보건" }).check();
  await page.getByRole("button", { name: "필터 적용" }).click();
  await expect(page).toHaveURL(/category=/);
  await expect(page.locator(".dataset-card")).toHaveCount(1);
  await page.goto("/datasets?q=unmatchedzzzz");
  await expect(page.getByText("조건에 맞는 데이터가 없어요")).toBeVisible();
  await page.getByRole("link", { name: "전체 데이터 보기" }).click();
  await expect(page.locator(".dataset-card")).toHaveCount(3);
});
test("explicit DEMO sample downloads still return real sample bytes", async ({
  request,
}) => {
  const response = await request.get("/api/samples/occupational-cancer");
  expect(response.headers()["x-checksum-sha256"]).toMatch(/^[a-f0-9]{64}$/);
  expect(await response.text()).toContain('"industry"');
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
  expect((await request.get("/account/api-keys")).status()).toBe(404);
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
    "/tools",
    "/developers",
    "/apis",
    "/login",
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
      .getByRole("link", { name: "분석·체험" })
      .click();
    await expect(page).toHaveURL(/\/tools$/);
  }
});
