import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth";
export async function POST(request: NextRequest) {
  const appUrl = process.env.APP_URL;
  const client = await authClient();
  if (!appUrl || !client)
    return NextResponse.json(
      { error: "Google 로그인을 준비 중입니다." },
      { status: 503 },
    );
  const origin = request.headers.get("origin");
  if (origin !== new URL(appUrl).origin)
    return NextResponse.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL("/auth/callback", appUrl).toString(),
      scopes: "openid email profile",
    },
  });
  if (error || !data.url)
    return NextResponse.redirect(new URL("/login?error=oauth", appUrl), 303);
  return NextResponse.redirect(data.url, 303);
}
