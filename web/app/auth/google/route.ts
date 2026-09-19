import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authClient } from "@/lib/auth";
import {
  appOrigin,
  authCookieOptions,
  returnCookie,
  safeReturnPath,
} from "@/lib/auth-config";

export async function POST(request: NextRequest) {
  const origin = appOrigin();
  const client = await authClient();
  if (!origin || !client)
    return NextResponse.json(
      { error: "Google 로그인을 준비 중입니다." },
      { status: 503 },
    );
  if (request.headers.get("origin") !== origin)
    return NextResponse.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  const errorUrl = new URL("/login?error=oauth", origin);
  try {
    const form = await request.formData();
    const value = form.get("next");
    const next = safeReturnPath(typeof value === "string" ? value : null);
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("/auth/callback", origin).toString(),
        scopes: "openid email profile",
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) return NextResponse.redirect(errorUrl, 303);
    (await cookies()).set(returnCookie, next, {
      ...authCookieOptions(),
      maxAge: 900,
    });
    const response = NextResponse.redirect(data.url, 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.redirect(errorUrl, 303);
  }
}
