import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("../lib/auth", () => ({ authClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import { authClient } from "../lib/auth";
import { isAdmin, requireAdmin } from "../lib/admin";

const auth = vi.mocked(authClient);
function client({
  user = { id: "DEMO-user", user_metadata: { role: "admin" } } as object | null,
  authError = null as object | null,
  role = null as object | null,
  roleError = null as object | null,
} = {}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: role, error: roleError }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  auth.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: authError }),
    },
    from,
  } as unknown as Awaited<ReturnType<typeof authClient>>);
  return { from, query };
}
beforeEach(() => vi.resetAllMocks());
describe("draft publication boundary", () => {
  it("denies unconfigured and anonymous sessions before role lookup", async () => {
    auth.mockResolvedValue(null);
    expect(await isAdmin()).toBe(false);
    const mock = client({ user: null });
    expect(await isAdmin()).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("ignores self-editable admin metadata and non-admin roles", async () => {
    client();
    expect(await isAdmin()).toBe(false);
    client({ role: { user_id: "DEMO-user", role: "provider" } });
    expect(await isAdmin()).toBe(false);
  });
  it("requires a verified user and an admin assignment for that exact user", async () => {
    client({
      authError: { message: "expired" },
      role: { user_id: "DEMO-user", role: "admin" },
    });
    expect(await isAdmin()).toBe(false);
    client({ role: { user_id: "DEMO-other", role: "admin" } });
    expect(await isAdmin()).toBe(false);
    const mock = client({ role: { user_id: "DEMO-user", role: "admin" } });
    expect(await isAdmin()).toBe(true);
    expect(mock.query.eq).toHaveBeenCalledWith("user_id", "DEMO-user");
    expect(mock.query.eq).toHaveBeenCalledWith("role", "admin");
    await expect(requireAdmin()).resolves.toBeUndefined();
  });
  it("fails closed on database errors and rejects direct page access", async () => {
    client({
      roleError: { message: "table missing" },
      role: { user_id: "DEMO-user", role: "admin" },
    });
    expect(await isAdmin()).toBe(false);
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });
});
