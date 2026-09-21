import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { sanjeCatalog, studyPage, studyDemo } from "../lib/sanje";

test("all seven public introductions show the release and researcher without raw search APIs", async ({
  page,
  request,
}) => {
  await page.goto("/datasets/sanje");
  await expect(page.locator("h1")).toHaveText("산재 판정사례");
  await expect(page.locator(".tool-card")).toHaveCount(7);
  for (const study of sanjeCatalog.groups) {
    await page.goto(studyPage(study.id));
    await expect(page.locator("h1")).toHaveText(study.title);
    await expect(page.locator(".copd-metrics")).toContainText(
      study.cases.toLocaleString(),
    );
    await expect(page.locator(".copd-heading")).toContainText(
      "윤진하 · 연세대학교 산업보건연구소",
    );
    await expect(page.locator(".copd-heading")).toContainText("2026-09-19.v1");
    await expect(
      page.getByRole("link", { name: study.name + " 검색 DEMO 열기" }),
    ).toHaveAttribute("href", studyDemo(study.id));
    await expect(
      page.getByRole("button", { name: "사례 검색", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "파일·활용법", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "인증된 화면에서 원본 다운로드" }),
    ).toHaveAttribute("href", studyDemo(study.id) + "?tab=files");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect((await request.get("/datasets/sanje/unknown")).status()).toBe(404);
});

test("disease demos keep multi-select filters and show candidate evidence with paging", async ({
  page,
}) => {
  let payload: Record<string, unknown> = {};
  const sample = {
    accnum: "DEMO-A",
    year: "2015",
    approval: "인정",
    occupation: "DEMO 작업",
    ai_occupation: "DEMO 광원",
    ai_summary: "DEMO 합성 요약",
    ai_hazards: "DEMO 분진",
    qa: "matched",
    measurements: 0,
  };
  await page.route("**/demo/**", async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get("action");
    if (url.pathname.endsWith("/api")) {
      if (action === "info")
        return route.fulfill({
          json: { occupations: ["DEMO 광원", "DEMO 용접원"] },
        });
      if (action === "files") return route.fulfill({ json: { files: [] } });
      if (action === "search") {
        payload = route.request().postDataJSON();
        return route.fulfill({
          json: {
            results: [sample],
            total: 1,
            filtered_total: 1,
            page: 1,
            page_size: 20,
            ranking: "hybrid",
          },
        });
      }
      if (action === "case")
        return route.fulfill({
          json: {
            ...sample,
            fields: { ai_summary: sample.ai_summary },
            text: "DEMO 합성 판정문",
            measurement_rows: [],
            worktime: null,
            worktime_rows: [],
            standard_labels: {
              rows: [
                {
                  label_id: "DEMO-1",
                  raw_term: "DEMO 후보",
                  review_status: "unreviewed",
                },
              ],
              total: 51,
              page: 1,
              page_size: 50,
            },
          },
        });
      if (action === "labels")
        return route.fulfill({
          json: {
            rows: [{ label_id: "DEMO-51", raw_term: "DEMO 다음 후보" }],
            total: 51,
            page: 2,
            page_size: 50,
          },
        });
      return route.fulfill({
        status: 400,
        json: { error: "DEMO unsupported" },
      });
    }
    const file = url.pathname.includes("/assets/")
      ? "assets/" + basename(url.pathname)
      : "index.html";
    return route.fulfill({
      body: await readFile(resolve("../ai-api/static/copd", file)),
      contentType: file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".woff2")
            ? "font/woff2"
            : "text/html",
    });
  });
  await page.goto("/demo/sanje/musculoskeletal/");
  await expect(page.locator("h1")).toHaveText("근골격계 산재 판정 사례");
  await page
    .getByLabel("AI 표준 직종", { exact: true })
    .selectOption(["DEMO 광원", "DEMO 용접원"]);
  await page
    .getByLabel("청구 연도", { exact: true })
    .selectOption(["2015", "2016"]);
  await page.locator("form").getByRole("button", { name: "사례 검색", exact: true }).click();
  await expect(page.locator(".copd-case")).toHaveCount(1);
  expect(payload.mode).toBe("hybrid");
  expect(payload.occupation).toEqual(["DEMO 광원", "DEMO 용접원"]);
  expect(payload.year).toEqual(["2015", "2016"]);
  await page.locator(".copd-case").click();
  await expect(
    page.getByText("DEMO 합성 판정문", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "라벨·근무시간", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "DEMO 후보", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "다음 라벨", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "DEMO 다음 후보", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
