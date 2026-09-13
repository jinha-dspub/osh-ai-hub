import { createHash } from "node:crypto";
import { findDataset, sampleCsv } from "@/lib/catalog";
import { apiError } from "@/lib/api";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const d = findDataset((await params).slug);
  if (!d) return apiError(404, "NOT_FOUND", "샘플 파일을 찾을 수 없습니다.");
  const csv = "\ufeff" + sampleCsv(d);
  const hash = createHash("sha256").update(csv).digest("hex");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${d.slug}-DEMO.csv"`,
      "X-Checksum-SHA256": hash,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
