import { afterEach, describe, expect, it, vi } from "vitest";
import { createLog, sessionId } from "../demo/osh-support-programs/log";

const conditions = () => ({
  신청주체: "전체",
  근로자수: 30,
  업종: "C25",
  지역: "전국",
  기업: "모름",
  유해인자: "모름",
});

afterEach(() => vi.useRealTimers());

describe("support programme demand log", () => {
  it("makes session ids the server accepts", () => {
    expect(sessionId(new Date(2026, 9, 1))).toMatch(
      /^\d{4}-\d{2}-\d{2}-[a-z0-9]{8,16}$/,
    );
  });

  it("sends only unsent events with increasing 순번", async () => {
    const sent: string[] = [];
    const log = createLog(
      "react-0123456789",
      conditions,
      (b) => (sent.push(b), true),
    );
    log.record({ 행동: "열기" });
    await log.flush();
    log.record(
      { 행동: "링크이동", 사업ID: "2026-01", 종류: "apply", 검색어: "" },
      true,
    );
    await log.flush();
    const [a, b] = sent.map((s) => JSON.parse(s));
    expect([a.순번, b.순번]).toEqual([1, 2]);
    expect(a.이벤트.map((e: { 행동: string }) => e.행동)).toEqual(["열기"]);
    expect(b.이벤트[0]).not.toHaveProperty("검색어");
    expect(b.조건.업종).toBe("C25");
  });

  it("resends a failed batch byte-for-byte before newer events", async () => {
    const sent: string[] = [];
    let ok = false;
    const log = createLog(
      "react-0123456789",
      conditions,
      (b) => (sent.push(b), ok),
    );
    log.record({ 행동: "열기" });
    expect(await log.flush()).toBe(false);
    log.record({ 행동: "조건변경" });
    ok = true;
    expect(await log.flush()).toBe(true);
    expect(sent[1]).toBe(sent[0]);
    expect(JSON.parse(sent[2]).순번).toBe(2);
  });

  it("batches by size and by delay", async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const log = createLog(
      "react-0123456789",
      conditions,
      (b) => (sent.push(b), true),
    );
    for (let i = 0; i < 25; i++) log.record({ 행동: "조건변경" });
    await vi.runAllTimersAsync();
    log.record({ 행동: "열기" });
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2500);
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[0]).이벤트).toHaveLength(25);
  });
});
