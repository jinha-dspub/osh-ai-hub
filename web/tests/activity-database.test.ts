import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const admin = "00000000-0000-4000-8000-000000000001";
const member = "00000000-0000-4000-8000-000000000002";
const visitor = "11111111-1111-4111-8111-111111111111";
async function as(role: string, uid = "") {
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
}
beforeAll(async () => {
  db = new PGlite();
  // DEMO test-only Auth schema. No test account or credentials are created remotely.
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz, deleted_at timestamptz, email_confirmed_at timestamptz);
    create table auth.identities (user_id uuid references auth.users(id), provider text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    insert into auth.users(id,email,last_sign_in_at) values
      ('${admin}', 'DEMO-admin@example.invalid', now()), ('${member}', 'DEMO-member@example.invalid', now());`);
  await db.exec(await readFile(new URL("../../supabase/migrations/202611040001_site_activity.sql", import.meta.url), "utf8"));
  const bootstrap = (await readFile(new URL("../../supabase/operations/20261104_activity_admin.sql", import.meta.url), "utf8")).replaceAll("jinha@dspubs.org", "demo-admin@example.invalid");
  await expect(db.exec(bootstrap)).rejects.toThrow(/verified Google/);
  await db.exec("rollback");
  await db.exec(`update auth.users set email_confirmed_at = now() where id = '${admin}'; insert into auth.identities values ('${admin}', 'google')`);
  await db.exec(bootstrap);
}, 30000);
afterAll(async () => { await db.close(); });

describe.sequential("real PostgreSQL activity migration and RLS (DEMO fixtures)", () => {
  it("denies raw data, role escalation and admin summary to anonymous/ordinary users", async () => {
    for (const role of ["anon", "authenticated"]) {
      await as(role, role === "authenticated" ? member : "");
      for (const table of ["site_visitors", "site_activity_daily", "site_activity_totals"])
        await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.site_activity_summary()" )).rejects.toThrow(/permission denied|administrator required/);
      await expect(db.query(`insert into public.role_assignments values ('${member}', 'admin')`)).rejects.toThrow(/permission denied/);
    }
    expect((await db.query("select * from public.role_assignments")).rows).toEqual([]);
  });
  it("deduplicates browser reloads and tab heartbeats with database timestamps", async () => {
    await as("anon");
    await db.query("select public.record_site_visit($1)", [visitor]);
    await db.query("select public.record_site_visit($1)", [visitor]);
    await as("authenticated", admin);
    const { rows } = await db.query<{ summary: { totalVisits: number; totalBrowsers: number; activeBrowsers: number; todayVisits: number } }>("select public.site_activity_summary() as summary");
    expect(rows[0].summary).toMatchObject({ totalVisits: 1, totalBrowsers: 1, activeBrowsers: 1, todayVisits: 1 });
  });
  it("uses the JWT identity; switching or logging out clears the old browser association", async () => {
    await as("authenticated", member);
    await db.query("select public.record_site_visit($1)", [visitor]);
    await as("authenticated", admin);
    let result = await db.query<{ summary: { activeUsers: { id: string }[] } }>("select public.site_activity_summary() as summary");
    expect(result.rows[0].summary.activeUsers.map(u => u.id)).toEqual([member]);
    await as("anon");
    await db.query("select public.record_site_visit($1)", [visitor]);
    await as("authenticated", admin);
    result = await db.query("select public.site_activity_summary() as summary");
    expect(result.rows[0].summary.activeUsers).toEqual([]);
  });
  it("expires current presence at five minutes and starts a new visit after 30 minutes", async () => {
    await db.exec(`reset role; update public.site_visitors set last_seen = now() - interval '6 minutes'`);
    await as("authenticated", admin);
    let result = await db.query<{ summary: { activeBrowsers: number; totalVisits: number; totalBrowsers: number } }>("select public.site_activity_summary() as summary");
    expect(result.rows[0].summary.activeBrowsers).toBe(0);
    await as("anon");
    await db.query("select public.record_site_visit($1)", [visitor]);
    await db.exec(`reset role; update public.site_visitors set last_seen = now() - interval '31 minutes'`);
    await as("anon");
    await db.query("select public.record_site_visit($1)", [visitor]);
    await as("authenticated", admin);
    result = await db.query("select public.site_activity_summary() as summary");
    expect(result.rows[0].summary).toMatchObject({ activeBrowsers: 1, totalVisits: 2, totalBrowsers: 1 });
  });
  it("enables RLS on all tables and fixes the security definer search path", async () => {
    await db.exec("reset role");
    const { rows } = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('site_visitors','site_activity_daily','site_activity_totals','role_assignments')");
    expect(rows).toHaveLength(4);
    expect(rows.every(r => r.relrowsecurity)).toBe(true);
    const functions = await db.query<{ proconfig: string[] }>("select proconfig from pg_proc where proname in ('record_site_visit','site_activity_summary')");
    expect(functions.rows.every(r => r.proconfig.includes('search_path=""'))).toBe(true);
  });
});
