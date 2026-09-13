import { NextRequest, NextResponse } from "next/server";
import { filterDatasets } from "@/lib/catalog";
import { apiError, pagination } from "@/lib/api";
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const paging = pagination(params);
  if (!paging)
    return apiError(
      400,
      "INVALID_PAGINATION",
      "page는 1~100000, limit은 1~100 사이 정수여야 합니다.",
    );
  const matches = filterDatasets(Object.fromEntries(params));
  const data = matches
    .slice((paging.page - 1) * paging.limit, paging.page * paging.limit)
    .map((d) => ({
      slug: d.slug,
      title: d.title,
      description: d.description,
      category: d.category,
      format: d.format,
      updated_at: d.updated,
      version: "demo-1.0",
      is_demo: true,
      has_sample_api: d.api,
      url: `/datasets/${d.slug}`,
    }));
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        ...paging,
        total: matches.length,
        is_demo: true,
        notice: "합성 예제 자료입니다. 실제 통계가 아닙니다.",
      },
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
