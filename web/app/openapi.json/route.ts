import { NextResponse } from "next/server";
const paging = [
  {
    name: "page",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100000, default: 1 },
  },
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 10 },
  },
];
const responses = {
  "200": {
    description: "합성 예제 응답. meta.is_demo는 true입니다.",
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["success", "data", "meta"],
          properties: {
            success: { type: "boolean" },
            data: { type: "array", items: { type: "object" } },
            meta: {
              type: "object",
              properties: {
                is_demo: { type: "boolean", const: true },
                page: { type: "integer" },
                limit: { type: "integer" },
                total: { type: "integer" },
              },
            },
          },
        },
      },
    },
  },
  "400": { description: "유효하지 않은 매개변수" },
};
export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "OSH AI Hub Sample API",
      version: "1.0.0-demo",
      description:
        "공개 합성 예제 전용. 실제 통계 및 개인 API 키 인증은 제공하지 않습니다.",
    },
    servers: [{ url: "/" }],
    paths: {
      "/openapi/v1/datasets": {
        get: {
          summary: "예제 카탈로그 검색",
          parameters: [
            ...paging,
            ...["q", "category", "format", "sort"].map((name) => ({
              name,
              in: "query",
              schema: { type: "string" },
            })),
            ...["ai", "api"].map((name) => ({
              name,
              in: "query",
              schema: { type: "string", enum: ["true", "false"] },
            })),
          ],
          responses,
        },
      },
      "/openapi/v1/statistics/{slug}": {
        get: {
          summary: "예제 행 조회",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            ...paging,
            {
              name: "year",
              in: "query",
              description: "year 변수가 있는 자료에만 사용",
              schema: { type: "string", pattern: "^[0-9]{4}$" },
            },
          ],
          responses: {
            ...responses,
            "404": { description: "자료 없음 또는 API 미제공" },
          },
        },
      },
    },
  });
}
