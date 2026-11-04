import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { authClient } from "@/lib/auth";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  if (!(await isAdmin())) return new NextResponse(null, { status: 404, headers });
  try {
    const client = await authClient({ readOnly: true });
    const result = client && await client.rpc("site_activity_summary");
    if (!result || result.error || !result.data)
      return NextResponse.json({ error: "방문 현황을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요." }, { status: 503, headers });
    return NextResponse.json(result.data, { headers });
  } catch {
    return NextResponse.json({ error: "방문 현황을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요." }, { status: 503, headers });
  }
}
