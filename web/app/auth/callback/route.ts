import { NextRequest, NextResponse } from "next/server";
import { authClient, safeReturnPath } from "@/lib/auth";
export async function GET(request: NextRequest) {
  const client = await authClient();
  const appUrl = process.env.APP_URL;
  if (!client || !appUrl)
    return NextResponse.json(
      { error: "인증 설정이 준비되지 않았습니다." },
      { status: 503 },
    );
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          safeReturnPath(request.nextUrl.searchParams.get("next")),
          appUrl,
        ),
      );
  }
  return NextResponse.redirect(new URL("/login?error=callback", appUrl));
}
