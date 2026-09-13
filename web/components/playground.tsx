"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { Upload, ScanLine } from "lucide-react";
export function Playground() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  function choose(next: File | undefined) {
    setError("");
    setFile(null);
    setUrl("");
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setError("JPG, PNG, WebP 이미지를 선택해 주세요.");
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError("10MB 이하의 이미지를 선택해 주세요.");
      return;
    }
    setFile(next);
    setUrl(URL.createObjectURL(next));
  }
  return (
    <div className="playground-grid">
      <section className="upload-panel">
        <h2>01. 이미지 선택</h2>
        <label className="upload-area">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="체험 이미지 선택"
            onChange={(e) => choose(e.target.files?.[0])}
          />
          {url ? (
            <>
              <Image
                unoptimized
                width={640}
                height={360}
                src={url}
                alt="선택한 이미지 미리보기"
                onError={() => {
                  setError(
                    "이미지를 읽을 수 없습니다. 다른 파일을 선택해 주세요.",
                  );
                  setFile(null);
                  setUrl("");
                }}
              />
            </>
          ) : (
            <>
              <Upload size={30} />
              <strong>이미지를 선택해 주세요</strong>
              <span>JPG, PNG, WebP · 최대 10MB</span>
            </>
          )}
        </label>
        {file && (
          <p className="notice-label" style={{ marginTop: 12 }}>
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </p>
        )}
        {error && (
          <div className="info-note" role="alert">
            {error}
          </div>
        )}
        <button className="button" disabled>
          모델 연결 준비 중
        </button>
        <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
          선택한 이미지는 이 브라우저에서만 표시하며 서버로 전송하지 않습니다.
        </p>
      </section>
      <section className="result-panel">
        <h2>02. 분석 결과</h2>
        <div className="result-placeholder">
          <ScanLine size={43} />
          <h3>실제 AI 모델을 준비하고 있어요</h3>
          <p>
            모델이 연결되면 탐지 영역, 신뢰도와 처리 시간을 이곳에서 확인할 수
            있습니다.
          </p>
        </div>
      </section>
    </div>
  );
}
