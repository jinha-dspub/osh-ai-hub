import { NextRequest, NextResponse } from "next/server";
import { findDataset } from "@/lib/catalog";
import { apiError, pagination } from "@/lib/api";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const d = findDataset((await params).slug);
  if (!d || !d.api)
    return apiError(
      404,
      "DATASET_NOT_AVAILABLE",
      "샘플 API가 제공되는 자료를 찾을 수 없습니다.",
    );
  const query = request.nextUrl.searchParams;
  const paging = pagination(query);
  if (!paging)
    return apiError(
      400,
      "INVALID_PAGINATION",
      "page는 1~100000, limit은 1~100 사이 정수여야 합니다.",
    );
  const year = query.get("year");
  if (year && !/^\d{4}$/.test(year))
    return apiError(400, "INVALID_YEAR", "year는 네 자리 연도여야 합니다.");
  if (year && !d.variables.some((v) => v.name === "year"))
    return apiError(
      400,
      "UNSUPPORTED_FILTER",
      "이 자료에는 year 필터가 없습니다.",
    );
  const rows = d.sample.filter((r) => !year || String(r.year) === year);
  return NextResponse.json(
    {
      success: true,
      data: rows.slice(
        (paging.page - 1) * paging.limit,
        paging.page * paging.limit,
      ),
      meta: {
        ...paging,
        total: rows.length,
        dataset: d.slug,
        version: "demo-1.0",
        is_demo: true,
        notice: "실제 통계가 아닌 합성 자료입니다.",
      },
      variables: d.variables,
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
