import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth";
import { appOrigin } from "@/lib/auth-config";

export async function POST(request: NextRequest) {
  const origin = appOrigin();
  const client = await authClient();
  if (!origin || !client)
    return NextResponse.json(
      { error: "인증 설정이 준비되지 않았습니다." },
      { status: 503 },
    );
  if (request.headers.get("origin") !== origin)
    return NextResponse.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  let target = "/login?logged_out=1";
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) target = "/account?error=logout";
  } catch {
    target = "/account?error=logout";
  }
  const response = NextResponse.redirect(new URL(target, origin), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
