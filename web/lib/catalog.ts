export const categories = [
  "전체",
  "산업재해",
  "산업보건",
  "작업환경",
  "근로환경",
  "화학물질",
  "인간공학",
] as const;
export type Category = (typeof categories)[number];
export type Dataset = {
  slug: string;
  title: string;
  description: string;
  category: Category;
  format: "CSV" | "JSON" | "IMAGE";
  kind: "statistics" | "image" | "text";
  tags: string[];
  updated: string;
  year: number;
  api: boolean;
  ai: boolean;
  accent: "teal" | "blue" | "orange" | "purple";
  sample: Record<string, string | number>[];
  variables: { name: string; description: string; unit: string }[];
};
const statistics = [
  { year: 2021, industry: "건설업", cases: 120 },
  { year: 2022, industry: "건설업", cases: 108 },
  { year: 2023, industry: "건설업", cases: 96 },
  { year: 2024, industry: "건설업", cases: 89 },
  { year: 2025, industry: "건설업", cases: 82 },
  { year: 2025, industry: "제조업", cases: 64 },
];
const variables = [
  { name: "year", description: "관측 연도 (가상)", unit: "년" },
  { name: "industry", description: "산업 분류 (가상)", unit: "범주" },
  { name: "cases", description: "예제 사례 수 — 실제 통계 아님", unit: "건" },
];
export const datasets: Dataset[] = [
  {
    slug: "industrial-accidents",
    title: "업종별 산업재해 발생 현황",
    description:
      "연도와 업종에 따라 산업재해 데이터를 탐색하는 통계형 데이터 예제입니다.",
    category: "산업재해",
    format: "CSV",
    kind: "statistics",
    tags: ["산업재해", "업종별", "시계열"],
    updated: "2026-09-10",
    year: 2025,
    api: true,
    ai: false,
    accent: "teal",
    sample: statistics,
    variables,
  },
  {
    slug: "occupational-cancer",
    title: "업종별 직업성 암 분석 데이터",
    description:
      "업종별 암발생 분석과 연구 활용 흐름을 살펴보는 가상 집계 자료입니다.",
    category: "산업보건",
    format: "CSV",
    kind: "statistics",
    tags: ["직업성 암", "SIR", "코호트"],
    updated: "2026-09-09",
    year: 2025,
    api: true,
    ai: false,
    accent: "blue",
    sample: [
      { industry: "제조업", observed: 42, expected: 38, sir: 1.11 },
      { industry: "건설업", observed: 31, expected: 29, sir: 1.07 },
      { industry: "운수업", observed: 25, expected: 27, sir: 0.93 },
    ],
    variables: [
      { name: "industry", description: "업종", unit: "범주" },
      { name: "observed", description: "가상 관찰 사례", unit: "건" },
      { name: "expected", description: "가상 기대 사례", unit: "건" },
      { name: "sir", description: "가상 표준화발생비", unit: "비" },
    ],
  },
  {
    slug: "construction-ppe",
    title: "건설현장 안전보호구 이미지",
    description:
      "안전모와 안전조끼 탐지에 필요한 이미지 데이터 구조와 라벨 정보를 소개합니다.",
    category: "산업재해",
    format: "IMAGE",
    kind: "image",
    tags: ["안전모", "PPE", "객체 탐지"],
    updated: "2026-09-08",
    year: 2025,
    api: false,
    ai: true,
    accent: "orange",
    sample: [
      { image: "demo-001.jpg", label: "helmet", split: "train" },
      { image: "demo-002.jpg", label: "safety-vest", split: "validation" },
    ],
    variables: [
      {
        name: "image",
        description: "예시 이미지 파일명 (실제 파일 미제공)",
        unit: "문자열",
      },
      { name: "label", description: "탐지 대상 클래스", unit: "범주" },
      { name: "split", description: "학습·검증 분할", unit: "범주" },
    ],
  },
  {
    slug: "workplace-exposure",
    title: "작업환경 유해인자 측정 자료",
    description:
      "작업환경의 소음과 유해인자 측정 결과를 표현하는 샘플 메타데이터입니다.",
    category: "작업환경",
    format: "CSV",
    kind: "statistics",
    tags: ["작업환경측정", "소음", "노출"],
    updated: "2026-09-07",
    year: 2024,
    api: true,
    ai: false,
    accent: "purple",
    sample: [
      { factor: "소음", value: 72, unit: "dB(A)" },
      { factor: "소음", value: 78, unit: "dB(A)" },
    ],
    variables: [
      { name: "factor", description: "가상 측정 항목", unit: "범주" },
      { name: "value", description: "예제 측정값", unit: "항목별" },
      { name: "unit", description: "측정 단위", unit: "문자열" },
    ],
  },
  {
    slug: "working-conditions",
    title: "근로환경조사 연구용 샘플",
    description: "근로시간과 작업 조건을 탐색하는 합성 설문 데이터입니다.",
    category: "근로환경",
    format: "CSV",
    kind: "statistics",
    tags: ["근로시간", "설문", "합성 데이터"],
    updated: "2026-09-06",
    year: 2024,
    api: true,
    ai: false,
    accent: "blue",
    sample: [
      { id: "S001", hours: 40, shift: "주간" },
      { id: "S002", hours: 36, shift: "교대" },
    ],
    variables: [
      { name: "id", description: "합성 응답 ID", unit: "문자열" },
      { name: "hours", description: "주당 근로시간 예제", unit: "시간" },
      { name: "shift", description: "근무 형태", unit: "범주" },
    ],
  },
  {
    slug: "accident-narratives",
    title: "재해 사례 텍스트 데이터",
    description:
      "재해 발생 상황을 분류하고 분석하는 AI 학습용 합성 텍스트입니다.",
    category: "산업재해",
    format: "JSON",
    kind: "text",
    tags: ["사례 분석", "텍스트", "추락"],
    updated: "2026-09-05",
    year: 2025,
    api: true,
    ai: true,
    accent: "teal",
    sample: [
      {
        id: "T001",
        type: "추락",
        text: "교육용 합성 사례: 작업 발판에서 균형을 잃은 상황.",
      },
      {
        id: "T002",
        type: "끼임",
        text: "교육용 합성 사례: 장비 점검 중 손이 회전부에 접근한 상황.",
      },
    ],
    variables: [
      { name: "id", description: "합성 사례 ID", unit: "문자열" },
      { name: "type", description: "재해 유형", unit: "범주" },
      { name: "text", description: "합성 문장", unit: "텍스트" },
    ],
  },
  {
    slug: "chemical-inventory",
    title: "화학물질 정보 구조 샘플",
    description: "물질명과 관리 정보를 연결하는 카탈로그 구조 예제입니다.",
    category: "화학물질",
    format: "JSON",
    kind: "text",
    tags: ["물질 정보", "메타데이터"],
    updated: "2026-09-04",
    year: 2025,
    api: true,
    ai: false,
    accent: "purple",
    sample: [{ id: "CHEM-DEMO-01", name: "가상 물질 A", status: "검토 예제" }],
    variables: [
      { name: "id", description: "가상 식별자", unit: "문자열" },
      { name: "name", description: "가상 물질명", unit: "문자열" },
      { name: "status", description: "예제 상태", unit: "범주" },
    ],
  },
  {
    slug: "ergonomic-posture",
    title: "작업 자세 분류 데이터",
    description:
      "작업 자세의 라벨과 분류 체계를 탐색하는 AI 데이터 구성 예제입니다.",
    category: "인간공학",
    format: "JSON",
    kind: "text",
    tags: ["작업 자세", "근골격계", "분류"],
    updated: "2026-09-03",
    year: 2024,
    api: true,
    ai: true,
    accent: "orange",
    sample: [
      { id: "P001", posture: "서기", duration: 10 },
      { id: "P002", posture: "앉기", duration: 20 },
    ],
    variables: [
      { name: "id", description: "예제 ID", unit: "문자열" },
      { name: "posture", description: "작업 자세", unit: "범주" },
      { name: "duration", description: "가상 지속시간", unit: "분" },
    ],
  },
  {
    slug: "fire-smoke-images",
    title: "화재·연기 탐지 이미지",
    description:
      "화재와 연기 탐지 모델의 학습 데이터 구성을 설명하는 메타데이터입니다.",
    category: "산업재해",
    format: "IMAGE",
    kind: "image",
    tags: ["화재", "연기", "객체 탐지"],
    updated: "2026-09-02",
    year: 2025,
    api: false,
    ai: true,
    accent: "orange",
    sample: [{ image: "fire-demo.jpg", label: "smoke" }],
    variables: [
      {
        name: "image",
        description: "예시 파일명 (실제 파일 미제공)",
        unit: "문자열",
      },
      { name: "label", description: "예제 클래스", unit: "범주" },
    ],
  },
  {
    slug: "health-check-summary",
    title: "특수건강진단 집계 샘플",
    description:
      "개인 정보 없이 집계 자료의 제공 방식을 살펴보는 합성 통계 예제입니다.",
    category: "산업보건",
    format: "CSV",
    kind: "statistics",
    tags: ["건강진단", "집계", "합성 데이터"],
    updated: "2026-09-01",
    year: 2024,
    api: true,
    ai: false,
    accent: "blue",
    sample: [
      { group: "가상군 A", count: 100 },
      { group: "가상군 B", count: 85 },
    ],
    variables: [
      { name: "group", description: "합성 집단", unit: "문자열" },
      { name: "count", description: "가상 인원", unit: "명" },
    ],
  },
  {
    slug: "forklift-images",
    title: "지게차 작업환경 이미지",
    description:
      "사람과 지게차가 함께 있는 작업 장면의 라벨 구조를 소개합니다.",
    category: "산업재해",
    format: "IMAGE",
    kind: "image",
    tags: ["지게차", "충돌", "객체 탐지"],
    updated: "2026-08-28",
    year: 2025,
    api: false,
    ai: true,
    accent: "teal",
    sample: [{ image: "forklift-demo.jpg", label: "forklift" }],
    variables: [
      {
        name: "image",
        description: "예시 파일명 (실제 파일 미제공)",
        unit: "문자열",
      },
      { name: "label", description: "예제 클래스", unit: "범주" },
    ],
  },
  {
    slug: "workplace-noise",
    title: "작업장 소음 시계열 샘플",
    description:
      "시간대에 따른 소음 측정 흐름을 살펴보는 합성 센서 자료입니다.",
    category: "작업환경",
    format: "CSV",
    kind: "statistics",
    tags: ["소음", "센서", "시계열"],
    updated: "2026-08-25",
    year: 2025,
    api: true,
    ai: false,
    accent: "purple",
    sample: [
      { time: "09:00", value: 70 },
      { time: "10:00", value: 74 },
      { time: "11:00", value: 71 },
    ],
    variables: [
      { name: "time", description: "가상 측정 시각", unit: "HH:mm" },
      { name: "value", description: "합성 소음값", unit: "dB(A)" },
    ],
  },
];
export type CatalogFilters = {
  q?: string;
  category?: string;
  format?: string;
  ai?: string;
  api?: string;
  sort?: string;
};
const normalize = (value: string) =>
  value.toLocaleLowerCase().replace(/\s+/g, "");
export function filterDatasets(filters: CatalogFilters): Dataset[] {
  const query = normalize((filters.q ?? "").trim());
  return datasets
    .filter(
      (d) =>
        (!query ||
          normalize([d.title, d.description, ...d.tags].join(" ")).includes(
            query,
          )) &&
        (!filters.category ||
          filters.category === "전체" ||
          d.category === filters.category) &&
        (!filters.format || d.format === filters.format) &&
        (filters.ai !== "true" || d.ai) &&
        (filters.api !== "true" || d.api),
    )
    .sort((a, b) =>
      filters.sort === "title"
        ? a.title.localeCompare(b.title, "ko")
        : b.updated.localeCompare(a.updated),
    );
}
export function findDataset(slug: string) {
  return datasets.find((d) => d.slug === slug);
}
export function sampleCsv(dataset: Dataset): string {
  const keys = dataset.variables.map((v) => v.name);
  const escape = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`;
  return (
    [
      keys.map(escape).join(","),
      ...dataset.sample.map((row) =>
        keys.map((key) => escape(row[key] ?? "")).join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
