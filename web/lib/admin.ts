import { cache } from "react";
import { notFound } from "next/navigation";
import { authClient } from "./auth";

// Request-scoped only. Never trust profile fields, URL flags or browser metadata.
export const isAdmin = cache(async (): Promise<boolean> => {
  const client = await authClient({ readOnly: true });
  if (!client) return false;
  try {
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user) return false;
    const { data, error } = await client
      .from("role_assignments")
      .select("user_id, role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    return !error && data?.user_id === user.id && data?.role === "admin";
  } catch {
    // Missing auth/schema or unavailable provider must never publish drafts.
    return false;
  }
});

export async function requireAdmin() {
  if (!(await isAdmin())) notFound();
}
