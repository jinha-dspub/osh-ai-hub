import { test, expect } from "@playwright/test";

test("collaboration has its own navigation, templates and real contact address", async ({
  page,
}, info) => {
  await page.goto("/datasets");
  await expect(page.locator(".dataset-card")).toHaveCount(1);
  await expect(page.locator(".dataset-card")).not.toContainText(
    "Family Design",
  );
  await expect(
    page.getByRole("radio", { name: "데이터 제작 가이드" }),
  ).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "주 메뉴" });
  await expect(
    nav.getByRole("link", { name: "개발자 API", exact: true }),
  ).toHaveCount(0);
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "메뉴 열기" }).click();
  await nav.getByRole("link", { name: "협업", exact: true }).click();
  await expect(page).toHaveURL(/\/collaboration$/);
  await expect(page.locator("h1")).toHaveText("협업");
  await expect(page.locator(".dataset-card")).toHaveCount(2);
  for (const name of ["협업 소개", "협업 템플릿", "협업 요청"]) {
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("link", { name: "jinha@dspubs.org", exact: true }),
  ).toHaveAttribute("href", "mailto:jinha@dspubs.org");
  for (const width of info.project.name === "mobile"
    ? [360, 393]
    : [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/collaboration-${info.project.name}.png`,
    fullPage: true,
  });
  for (const path of [
    "/datasets/family-design",
    "/datasets/opendata-guide",
    "/developers",
    "/apis",
  ]) {
    await page.goto(path);
    if (info.project.name === "mobile")
      await page.getByRole("button", { name: "메뉴 열기" }).click();
    await expect(
      nav.getByRole("link", { name: "협업", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("link", { name: "데이터 찾기", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
  }
  await page.goto("/datasets/opendata-guide");
  await page.getByRole("link", { name: "← 협업 템플릿으로" }).click();
  await expect(page).toHaveURL(/\/collaboration#templates$/);
});
