import { test, expect } from "@playwright/test";
import path from "node:path";
const summary = {
  startedAt: "2026-11-04T01:00:00Z", updatedAt: "2026-11-04T02:00:00Z",
  activeBrowsers: 3, totalVisits: 12, totalBrowsers: 7, todayVisits: 12, registeredUsers: 2,
  activeUsers: [{ id: "DEMO-member", name: "DEMO 사용자", email: "demo@example.invalid", lastSeen: "2026-11-04T01:59:00Z" }],
  recentLogins: [{ id: "DEMO-member", name: "DEMO 사용자", email: "demo@example.invalid", lastSignIn: "2026-11-04T01:00:00Z" }],
  daily: [{ day: "2026-11-04", visits: 12 }],
};
test("DEMO component: populated, stale, empty and forbidden states; mobile layout", async ({ page }) => {
  let state = "loaded";
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/admin/activity", route => {
    if (state === "error") return route.fulfill({ status: 503, json: { error: "DEMO unavailable" } });
    if (state === "denied") return route.fulfill({ status: 404 });
    return route.fulfill({ json: state === "empty" ? { ...summary, activeUsers: [], recentLogins: [], daily: [] } : summary });
  });
  await page.goto("/");
  await expect(page.getByText("demo@example.invalid")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "누적 방문", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/activity-${test.info().project.name}.png`, fullPage: true });
  state = "error";
  await page.getByRole("button", { name: "새로고침" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("아래는 마지막으로 확인한 값입니다.")).toBeVisible();
  state = "empty";
  await page.getByRole("button", { name: "새로고침" }).click();
  await expect(page.getByText("최근 5분 내 활동 중인 로그인 사용자가 없습니다.")).toBeVisible();
  state = "denied";
  await page.getByRole("button", { name: "새로고침" }).click();
  await expect(page.getByText("관리자 로그인을 확인해 주세요.")).toBeVisible();
  await expect(page.getByText("demo@example.invalid")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("heartbeat submits no identity, pauses in hidden tabs and resumes visibly", async ({ page }) => {
  let count = 0;
  await page.route("**/api/admin/activity", route => route.fulfill({ status: 404 }));
  await page.route("**/api/activity", route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postData()).toBeNull();
    count++;
    return route.fulfill({ status: 204 });
  });
  await page.clock.install();
  await page.goto("/");
  await page.addScriptTag({ path: path.resolve("public/activity.js") });
  await expect.poll(() => count).toBe(1);
  await page.clock.runFor(61000);
  await expect.poll(() => count).toBe(2);
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));
  await page.clock.runFor(120000);
  expect(count).toBe(2);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => count).toBe(3);
});
