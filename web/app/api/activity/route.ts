import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth";
import { appOrigin } from "@/lib/auth-config";
import { visitorCookie, visitorPattern } from "@/lib/activity";

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin)
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403, headers });
  // No client-supplied identity, timestamps, URLs, search terms or counts.
  if (request.body !== null)
    return NextResponse.json({ error: "요청 본문은 받지 않습니다." }, { status: 400, headers });
  const client = await authClient();
  if (!client) return new NextResponse(null, { status: 503, headers });
  const cookie = request.cookies.get(visitorCookie)?.value;
  const visitor = cookie && visitorPattern.test(cookie) ? cookie : crypto.randomUUID();
  try {
    // PostgREST validates the session JWT; SQL derives user_id from auth.uid().
    const { error } = await client.rpc("record_site_visit", { p_visitor_id: visitor });
    if (error) return new NextResponse(null, { status: 503, headers });
    const response = new NextResponse(null, { status: 204, headers });
    response.cookies.set(visitorCookie, visitor, {
      httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax",
      path: "/", maxAge: 365 * 24 * 60 * 60,
    });
    return response;
  } catch {
    return new NextResponse(null, { status: 503, headers });
  }
}
