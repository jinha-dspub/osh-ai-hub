import { test, expect } from "@playwright/test";
import release from "../lib/family-design-release.json";

test("catalog filter options stay below headings and inside the sidebar", async ({
  page,
}, info) => {
  for (const width of info.project.name === "desktop"
    ? [1440, 1024, 851]
    : [360, 393]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/datasets");
    const groups = await page.locator(".filter-group").evaluateAll((elements) =>
      elements.map((group) => {
        const legend = group.querySelector("legend")!.getBoundingClientRect();
        const first = group.querySelector("label")!.getBoundingClientRect();
        const bounds = group.getBoundingClientRect();
        return {
          width: first.width,
          below: first.top >= legend.bottom,
          inside: first.left >= bounds.left && first.right <= bounds.right + 1,
        };
      }),
    );
    for (const group of groups) {
      expect(group.width).toBeGreaterThan(30);
      expect(group.below).toBe(true);
      expect(group.inside).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: `test-results/catalog-filters-${info.project.name}.png`,
    fullPage: true,
  });
});

test("collaboration templates open an interactive design kit with direct storage downloads", async ({
  page,
}, info) => {
  await page.goto("/collaboration");
  await expect(
    page.locator(".dataset-card").filter({ hasText: "OSH Family Design" }),
  ).toContainText("공개 디자인 키트");
  await page
    .getByRole("heading", { name: "OSH Family Design" })
    .getByRole("link")
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "OSH Family Design",
  );
  const table = page.getByRole("table");
  await expect(table.locator("tbody tr")).toHaveCount(3);
  await page.getByLabel("예시 검색어").fill("문서");
  await page.getByRole("button", { name: "예시 검색", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("예시 검색어").fill("없는항목");
  await page.getByRole("button", { name: "예시 검색", exact: true }).click();
  await expect(
    page.getByText("일치하는 예시가 없습니다.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "초기화", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(3);
  for (const file of release.files) {
    const link = page.locator(`a[download="${file.name}"]`).last();
    await expect(link).toHaveAttribute("href", file.url);
    expect(new URL(file.url).pathname).toMatch(
      /^\/storage\/v1\/object\/public\/osh-design-assets\//,
    );
  }
  // A refused clipboard must show a fallback instead of pretending success.
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    }),
  );
  await page.getByRole("button", { name: "지시문 복사" }).click();
  await expect(
    page.getByText("자동 복사를 사용할 수 없습니다.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/family-design-${info.project.name}.png`,
    fullPage: true,
  });
});
