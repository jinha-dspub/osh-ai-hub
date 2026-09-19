import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { authConfigured, authCookieOptions } from "./auth-config";
export { authConfigured, safeReturnPath } from "./auth-config";

export async function authClient({ readOnly = false } = {}) {
  if (!authConfigured()) return null;
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll: () => store.getAll(),
        setAll(values) {
          if (readOnly) return;
          values.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        },
      },
    },
  );
}

export const currentUser = cache(async () => {
  try {
    const client = await authClient({ readOnly: true });
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    return error ? null : data.user;
  } catch {
    return null;
  }
});
