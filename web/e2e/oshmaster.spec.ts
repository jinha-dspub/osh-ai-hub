import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
test("OSHMASTER is discoverable with a three-row introduction and gated demo links", async ({
  page,
}) => {
  await page.goto("/datasets?q=OSHMASTER");
  await page
    .getByRole("heading", { name: "산업안전보건 표준분류 마스터", exact: true })
    .getByRole("link")
    .click();
  await expect(page.locator("h1")).toHaveText("산업안전보건 표준분류 마스터");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(
    page.getByRole("link", { name: "표준분류 검색 DEMO 열기 →" }),
  ).toHaveAttribute("href", "/demo/oshmaster/");
  await expect(
    page.getByRole("link", { name: "인증된 화면에서 파일 받기" }),
  ).toHaveAttribute("href", "/demo/oshmaster/#files");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("dictionary demo confirms a scope and exports actual selection JSON", async ({
  page,
}) => {
  const parent = {
    record_id: "DEMO-parent",
    code: "DEMO34",
    label: "DEMO 합성 분류",
    std: "KCD",
    std_version: "9차_2026",
    axis: "DISEASE",
    match_kind: "alias",
  };
  const child = {
    ...parent,
    record_id: "DEMO-child",
    code: "DEMO34.0",
    label: "DEMO 하위 분류",
  };
  await page.route("**/demo/oshmaster/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/api/")) {
      const action = url.pathname.split("/").at(-1);
      if (action === "catalogue")
        return route.fulfill({
          json: {
            scopes: [
              {
                axis: "DISEASE",
                std: "KCD",
                std_version: "9차_2026",
                count: 2,
              },
            ],
            axis_labels: { DISEASE: "DEMO 질병" },
            standard_labels: { KCD: "DEMO 표준" },
          },
        });
      if (action === "files") return route.fulfill({ json: { files: [] } });
      if (action === "search")
        return route.fulfill({
          json: { results: [parent], total: 1, offset: 0, next_offset: null },
        });
      if (action === "detail") {
        const include = url.searchParams.get("include_descendants") === "true";
        return route.fulfill({
          json: {
            node: parent,
            ancestors: [],
            children: [child],
            children_total: 1,
            scope: include ? [parent, child] : [parent],
            scope_total: include ? 2 : 1,
            issues: [],
            next_offset: null,
            case_label_approved: false,
          },
        });
      }
      return route.fulfill({ status: 400, json: { error: "DEMO 요청 오류" } });
    }
    const file = url.pathname.includes("/assets/")
      ? "assets/" + basename(url.pathname)
      : "index.html";
    return route.fulfill({
      body: await readFile(resolve("../ai-api/static/oshmaster", file)),
      contentType: file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".woff2")
            ? "font/woff2"
            : "text/html",
    });
  });
  await page.goto("/demo/oshmaster/");
  await page.getByLabel("검색어 또는 코드").fill("DEMO 표현");
  await page
    .getByRole("button", { name: "표준분류 검색", exact: true })
    .click();
  await page.locator(".master-hit").click();
  await expect(
    page.getByRole("button", { name: "선택 코드 JSON 받기" }),
  ).toBeDisabled();
  await page.getByLabel("하위 코드까지 포함").check();
  await expect(page.getByText("선택 범위: 2개 코드")).toBeVisible();
  await page.getByLabel("선택한 판본과 코드 범위를 확인했습니다").check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "선택 코드 JSON 받기" }).click();
  const saved = await download;
  const result = JSON.parse(await readFile((await saved.path())!, "utf8"));
  expect(result.demo).toBe(true);
  expect(result.case_label_approved).toBe(false);
  expect(result.codes).toHaveLength(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("검색어 또는 코드").fill("DEMO 다른 표현");
  await expect(
    page.getByRole("button", { name: "선택 코드 JSON 받기" }),
  ).toHaveCount(0);
});
