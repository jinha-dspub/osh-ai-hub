import { copdRequestAllowed } from "@/lib/copd-access";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const fail = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers });

async function bridge(request: Request) {
  if (
    !copdRequestAllowed(
      request.url,
      request.headers.get("origin"),
      request.method,
    )
  ) {
    return fail("실제 사례 검색은 로컬 내부 미리보기에서만 제공됩니다.", 403);
  }
  const action = new URL(request.url).searchParams.get("action");
  let endpoint: string;
  let payload: string | undefined;
  if (request.method === "GET" && action === "info") endpoint = "info";
  else if (request.method === "GET" && action === "case") {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id || id.length > 100) return fail("사례 번호를 확인해 주세요.", 400);
    endpoint = `cases/${encodeURIComponent(id)}`;
  } else if (
    request.method === "POST" &&
    (action === "search" || action === "explain")
  ) {
    if (request.headers.get("content-type") !== "application/json")
      return fail("JSON 요청이 필요합니다.", 415);
    const reader = request.body?.getReader();
    if (!reader) return fail("입력값이 없습니다.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return fail("입력 용량을 초과했습니다.", 413);
      }
      chunks.push(value);
    }
    payload = Buffer.concat(chunks).toString("utf8");
    try {
      JSON.parse(payload);
    } catch {
      return fail("입력 형식이 올바르지 않습니다.", 400);
    }
    endpoint = action;
  } else return fail("지원하지 않는 요청입니다.", 400);
  try {
    const response = await fetch(`http://127.0.0.1:8102/copd/${endpoint}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${process.env.COPD_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: payload,
      signal: AbortSignal.timeout(endpoint === "explain" ? 185000 : 70000),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) {
      const message =
        typeof data.detail === "string"
          ? data.detail
          : "입력 조건을 확인해 주세요.";
      return fail(message, response.status);
    }
    return Response.json(data, { headers });
  } catch {
    return fail(
      "내부 검색 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }
}
export const GET = bridge;
export const POST = bridge;
