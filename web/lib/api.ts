import { NextResponse } from "next/server";
export function apiError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message }, meta: { is_demo: true } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export function pagination(params: URLSearchParams) {
  const page = Number(params.get("page") ?? 1);
  const limit = Number(params.get("limit") ?? 10);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    return null;
  return { page, limit };
}
