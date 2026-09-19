import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { authConfigured, authCookieOptions } from "@/lib/auth-config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!authConfigured()) return response;
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          const previous = response.cookies.getAll();
          response = NextResponse.next({ request });
          previous.forEach((cookie) => response.cookies.set(cookie));
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  try {
    // Refresh and validate with Auth. Page guards independently verify identity.
    await client.auth.getUser();
  } catch {
    /* Public pages remain readable during an Auth outage. */
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // OAuth handlers own their cookies. Existing DEMO proxy authentication is separate.
  matcher: ["/((?!auth/|demo/|api/|openapi/|_next/|.*\\.[^/]+$).*)"],
};
