// Demand log (schema 3; schema 2 was the package DEMO.md form with 갈래·범주): append-only
// batches of not-yet-sent events.
// The server stores each batch once under the NAS raw area; failed sends are re-queued.

export type Conditions = {
  신청주체: string;
  근로자수: number;
  업종: string;
  지역: string;
  기업: string;
  유해인자: string;
};
export type FormField =
  | "신청주체"
  | "근로자수"
  | "업종"
  | "지역"
  | "기업"
  | "유해인자"
  | "분류"
  | "키워드"
  | "관련사업";
export type LogEvent = {
  행동:
    | "열기"
    | "분류선택"
    | "분류해제"
    | "받는방식선택"
    | "받는방식해제"
    | "검색"
    | "조건변경"
    | "노출"
    | "품목펼침"
    | "링크이동"
    | "0건"
    | "AI제안"
    | "AI적용"
    | "AI수정";
  사업ID?: string;
  범주?: string;
  분류?: string[];
  받는방식?: string[];
  항목?: FormField[];
  요청ID?: string;
  순위?: number;
  결과건수?: number;
  검색어?: string;
  목록?: string[];
  종류?: "official" | "apply";
};
type Sender = (body: string) => boolean | Promise<boolean>;

const BATCH = 25;
const DELAY = 2500;
export const ENDPOINT = "/demo/osh-support-programs/api/log";

export function sessionId(now = new Date(), random = Math.random) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  let tail = "";
  while (tail.length < 10) tail += random().toString(36).slice(2);
  return `${day}-${tail.slice(0, 10)}`;
}

export function beacon(body: string): boolean | Promise<boolean> {
  const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
  if (navigator.sendBeacon?.(ENDPOINT, blob)) return true;
  return fetch(ENDPOINT, { method: "POST", body: blob, keepalive: true })
    .then((r) => r.ok)
    .catch(() => false);
}

export function createLog(
  build: string,
  conditions: () => Conditions,
  send: Sender = beacon,
  clock: () => number = Date.now,
  release = "",
) {
  const started = clock();
  const session = sessionId(new Date(started));
  let buffer: (LogEvent & { t: number })[] = [];
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  let retry: string | undefined;
  let busy = false;

  async function flush() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (busy) return false;
    busy = true;
    try {
      while (retry || buffer.length) {
        // A failed batch is resent byte-for-byte; the server keeps the first copy of a 순번.
        retry ??= JSON.stringify({
          스키마: 3,
          판본: build,
          ...(release && { 자료판: release }),
          세션ID: session,
          순번: ++sequence,
          시작: new Date(started).toISOString(),
          갱신: new Date(clock()).toISOString(),
          조건: conditions(),
          이벤트: buffer.splice(0, BATCH),
        });
        if (!(await send(retry))) return false;
        retry = undefined;
      }
      return true;
    } finally {
      busy = false;
    }
  }

  function record(event: LogEvent, now = false) {
    const clean = Object.fromEntries(
      Object.entries(event).filter(
        ([, v]) =>
          v !== undefined && v !== "" && !(Array.isArray(v) && !v.length),
      ),
    ) as LogEvent;
    buffer.push({ t: clock() - started, ...clean });
    if (buffer.length > 200) buffer = buffer.slice(-200);
    if (now || buffer.length >= BATCH) void flush();
    else {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), DELAY);
    }
  }

  return { record, flush, session };
}
