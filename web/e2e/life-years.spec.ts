import { test, expect } from "@playwright/test";

const slug = "ei-nhis-life-years-lost";
const prefix = `/demo/${slug}/`;
const backend = "http://127.0.0.1:8113";

test("published guide, real calculator, files and input error states", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Exercise the actual gateway in its explicit loopback preview mode.
  await page.route(`**${prefix}**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: backend + url.pathname + url.search,
      headers: { ...route.request().headers(), Origin: "https://osh.ai.kr" },
    });
    await route.fulfill({ response });
  });
  await page.goto("/datasets?q=손실연수");
  await page
    .getByRole("link", {
      name: "고용보험–건보 집계표·손실연수 계산 DEMO",
      exact: true,
    })
    .click();
  await expect(page.locator("h1")).toHaveText(
    "고용보험–건보 집계표와 손실연수",
  );
  await expect(page.locator("tbody tr")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/life-years-intro-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "손실연수 계산 DEMO 열기" }).click();
  await expect(page.locator("#run")).toBeEnabled();
  await expect(page.locator("#case option")).toHaveCount(9);
  await page.locator("#end").selectOption("65");
  await page.locator("#run").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#rows tr")).toHaveCount(3);
  await expect(page.locator("#result-kind")).toContainText("DEMO");
  for (const id of ["csv", "json", "input", "life"]) {
    const download = page.waitForEvent("download");
    await page.locator(`#${id}`).click();
    expect(await (await download).failure()).toBeNull();
  }
  for (const link of await page.locator("a[download]").all()) {
    const href = await link.getAttribute("href");
    const response = await request.get(backend + prefix + href);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toBe("attachment");
  }
  await page.screenshot({
    path: `test-results/life-years-demo-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#case").selectOption("7");
  await expect(page.locator("#run")).toBeEnabled();
  await expect(page.locator("#end")).toHaveValue("60");
  await expect(page.locator('#end option[value="65"]')).toHaveJSProperty(
    "disabled",
    true,
  );
  await page.locator("#run").click();
  await expect(page.locator("#result")).toBeVisible();
  const data = await (
    await request.get(backend + prefix + "data/demo_cohort_10y_industry.json")
  ).json();
  data.aggregate[0].cell_status = "suppressed";
  await page
    .locator("#upload")
    .setInputFiles({
      name: "DEMO-invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await expect(page.locator("#run")).toBeEnabled();
  await page.locator("#run").click();
  await expect(page.locator("#status")).toContainText("비공개");
  await expect(page.locator("#result")).toBeHidden();
  expect(errors).toEqual([]);
});
