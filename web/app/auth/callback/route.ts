import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authClient } from "@/lib/auth";
import {
  appOrigin,
  authCookieOptions,
  returnCookie,
  safeReturnPath,
} from "@/lib/auth-config";

export async function GET(request: NextRequest) {
  const client = await authClient();
  const origin = appOrigin();
  if (!client || !origin)
    return NextResponse.json(
      { error: "인증 설정이 준비되지 않았습니다." },
      { status: 503 },
    );
  const store = await cookies();
  const next = safeReturnPath(store.get(returnCookie)?.value ?? null);
  store.set(returnCookie, "", { ...authCookieOptions(), maxAge: 0 });
  let target = "/login?error=callback";
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.searchParams.has("error"))
    target = "/login?error=cancelled";
  else if (code) {
    try {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        const result = await client.auth.getUser();
        if (!result.error && result.data.user) target = next;
      }
    } catch {
      /* Never expose provider errors, codes, or tokens. */
    }
  }
  const response = NextResponse.redirect(new URL(target, origin), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
