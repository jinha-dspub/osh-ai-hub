import { test, expect } from "@playwright/test";
// OAuth handoff only. These DEMO credentials never authenticate an actual account.
test("configured login is reachable and usable on desktop/mobile", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("link", { name: "로그인", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "OSH AI Hub 로그인" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/google-login-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(
    page.getByRole("link", { name: "내 계정", exact: true }),
  ).toHaveCount(0);
});
test("OAuth start sets PKCE and safe return cookies without granting a session", async ({
  request,
}) => {
  const response = await request.post("/auth/google", {
    headers: { origin: "http://127.0.0.1:3102" },
    form: { next: "//attacker.example" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  const target = new URL(response.headers().location);
  expect(target.pathname).toBe("/auth/v1/authorize");
  expect(target.searchParams.get("provider")).toBe("google");
  expect(target.searchParams.get("code_challenge_method")).toBe("s256");
  expect(target.searchParams.get("redirect_to")).toBe(
    "http://127.0.0.1:3102/auth/callback",
  );
  const cookies = (await request.storageState()).cookies;
  expect(cookies.find((c) => c.name === "osh-auth-return")).toMatchObject({
    value: "%2Faccount",
    httpOnly: true,
    sameSite: "Lax",
  });
  expect(cookies.find((c) => c.name.endsWith("code-verifier"))?.httpOnly).toBe(
    true,
  );
  expect(
    (await request.get("/account", { maxRedirects: 0 })).headers().location,
  ).toContain("/login");
});
test("cross-site mutations, callback errors and forged roles fail closed", async ({
  request,
  page,
}) => {
  for (const path of ["/auth/google", "/auth/logout"]) {
    expect(
      (
        await request.post(path, {
          headers: { origin: "https://attacker.example" },
          form: {},
        })
      ).status(),
    ).toBe(403);
    expect((await request.get(path)).status()).toBe(405);
  }
  await page.goto(
    "/auth/callback?error=access_denied&error_description=DEMO-injected",
  );
  await expect(page.getByRole("alert").filter({ hasText: "Google 로그인이" })).toContainText("취소");
  await expect(page.getByText("DEMO-injected")).toHaveCount(0);
  expect(
    (
      await request.get("/admin/drafts?admin=true", {
        headers: { cookie: "role=admin; isAdmin=true" },
      })
    ).status(),
  ).toBe(404);
});
