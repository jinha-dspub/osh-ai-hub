// Builds the downloadable support programme dataset: the catalogue the site serves plus every
// label its filters use, computed with the site's own rules so the files rebuild the same screen.
//
// Usage: node scripts/build-support-programs-dataset.mjs <catalogue.json> <package-dir> <out-dir>
//   catalogue.json  GET /demo/osh-support-programs/api/catalogue (categories and their notes)
//   package-dir     serving/current: full programs/items/categories tables and the data dictionary
//   out-dir         new folder; must not exist
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [cataloguePath, packageDir, out] = process.argv.slice(2);
if (!out) {
  console.error(
    "usage: build-support-programs-dataset.mjs <catalogue.json> <package-dir> <out-dir>",
  );
  process.exit(1);
}
if (existsSync(out)) throw Error(`${out} already exists`);

const web = fileURLToPath(new URL("../", import.meta.url));
const bundle = join(tmpdir(), `sp-dataset-${process.pid}.mjs`);
await build({
  stdin: {
    contents:
      'export * from "./demo/osh-support-programs/rules";\nexport * from "./demo/osh-support-programs/ksic";',
    resolveDir: web,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundle,
  logLevel: "silent",
});
const site = await import(pathToFileURL(bundle).href);

const VERSION = "0.7-hub.1";
const DATE = "2026-10-01";
// RFC 4180 reader (quoted commas, quotes and line breaks), returns objects by header.
function parse(text) {
  const rows = [[]];
  let cur = "";
  let quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      rows.at(-1).push(cur);
      cur = "";
    } else if (ch === "\n") {
      rows.at(-1).push(cur.replace(/\r$/, ""));
      cur = "";
      rows.push([]);
    } else cur += ch;
  }
  if (cur || rows.at(-1).length) rows.at(-1).push(cur);
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  return body.map((r) =>
    Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])),
  );
}
const table = async (name) =>
  parse(await readFile(join(packageDir, "2_자료/data", name), "utf8"));

const catalogue = JSON.parse(await readFile(cataloguePath, "utf8"));
const categories = catalogue["분류"];
const of = Object.fromEntries(
  (await table("categories.csv")).map((r) => [r["사업ID"], r["분류"]]),
);
const programs = (await table("programs.csv")).map((r) => {
  if (!of[r["사업ID"]]) throw Error(`${r["사업ID"]} has no category`);
  return { ...r, 분류: of[r["사업ID"]] };
});
const items = await table("items.csv");
// The served catalogue must be this same table (same rows, same values on shared columns).
for (const [i, served] of catalogue["사업"].entries())
  for (const [k, v] of Object.entries(served))
    if (programs[i][k] !== v)
      throw Error(`catalogue differs from package at ${served["사업ID"]}.${k}`);

// ---- labels -------------------------------------------------------------------

const ksic = [...site.sections, ...site.divisions];
// Divisions a programme's 대상업종 matches, written as a section letter when every division of
// that section matches. The site's own industryMatches decides, including the provisional names.
function industries(target) {
  if (target === "전체") return ["전체"];
  const codes = [];
  for (const s of site.sections) {
    const divs = site.divisions.filter((d) => d.parent === s.code);
    const hit = divs.filter((d) => site.industryMatches(target, d.code));
    if (hit.length && hit.length === divs.length) codes.push(s.code);
    else codes.push(...hit.map((d) => d.code));
  }
  return codes;
}
const who = {
  사업주: ["사업주"],
  근로자: ["근로자"],
  둘다: ["사업주", "근로자"],
};
const split = (v) =>
  v
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);

const labelled = programs.map((r) => {
  const region = r["지역"].split("(")[0].trim();
  return {
    ...r,
    받는방식: site.wayOf(r),
    신청주체_구분: who[site.applicant(r)].join(";"),
    대상업종_KSIC: industries(r["대상업종"]).join(";"),
    지역_시도: region.split(" ")[0],
    지역_세부: region.includes(" ") ? region : "",
    건설현장_한정:
      r["공사금액_상한_억원_미만"] &&
      !r["근로자수_하한"] &&
      !r["근로자수_상한_미만"]
        ? "Y"
        : "N",
    지원금액_요약: site.amount(r),
  };
});
const hubColumns = [
  "분류",
  "받는방식",
  "신청주체_구분",
  "대상업종_KSIC",
  "지역_시도",
  "지역_세부",
  "건설현장_한정",
  "지원금액_요약",
];
const sourceColumns = Object.keys(programs[0]).filter(
  (c) => !hubColumns.includes(c),
);

// Long form: one row per (programme, filter, value) — every filter button a programme sits under.
const filters = [];
for (const r of labelled) {
  const add = (filter, values) =>
    values.forEach((v) =>
      filters.push({ 사업ID: r["사업ID"], 필터: filter, 값: v }),
    );
  add("분류", [r["분류"]]);
  add("받는방식", [r["받는방식"]].filter(Boolean));
  add("지원형태", [r["지원형태"]]);
  add("신청주체", split(r["신청주체_구분"]));
  add("업종", split(r["대상업종_KSIC"]));
  add("지역", [r["지역_시도"]]);
  add("유해인자_필요", [r["유해인자_보유필요"] === "Y" ? "Y" : "N"]);
  add("위험요인", split(r["위험요인"]));
  add("기관구분", [r["기관구분"]]);
}

// ---- files --------------------------------------------------------------------

function csv(rows, columns) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return (
    "﻿" +
    [columns, ...rows.map((r) => columns.map((c) => r[c]))]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
const count = (pred) => labelled.filter(pred).length;
const tables = {
  "data/programs.csv": [labelled, [...sourceColumns, ...hubColumns]],
  "data/program_filters.csv": [filters, ["사업ID", "필터", "값"]],
  "data/items.csv": [items, Object.keys(items[0])],
  "data/categories.csv": [
    categories.map((c, i) => ({
      순서: i + 1,
      분류: c["이름"],
      설명: c["설명"],
      사업수: count((r) => r["분류"] === c["이름"]),
    })),
    ["순서", "분류", "설명", "사업수"],
  ],
  "data/ways.csv": [
    Object.entries(site.ways).map(([w, forms], i) => ({
      순서: i + 1,
      받는방식: w,
      지원형태: forms.join(";"),
      사업수: count((r) => r["받는방식"] === w),
    })),
    ["순서", "받는방식", "지원형태", "사업수"],
  ],
  "data/ksic.csv": [
    ksic.map((k) => ({ 코드: k.code, 이름: k.name, 상위: k.parent ?? "" })),
    ["코드", "이름", "상위"],
  ],
  "data/synonyms.csv": [
    site.synonyms.map((g, i) => ({ 묶음: i + 1, 낱말: g.join(";") })),
    ["묶음", "낱말"],
  ],
};

const dictionary = [];
const dict = (table, column, description, type, allowed = "", origin = "hub") =>
  dictionary.push({
    table,
    column,
    description,
    type,
    nullable: "false",
    missing_value: "",
    unit: "",
    allowed_values: allowed,
    origin,
    key:
      column === "사업ID" || column === "품목ID" || column === "코드"
        ? "primary"
        : "",
  });
// Package columns keep the package's own descriptions (1_문서/data_dictionary.csv).
const original = Object.fromEntries(
  parse(
    await readFile(join(packageDir, "1_문서/data_dictionary.csv"), "utf8"),
  ).map((row) => [`${row.table.split("/").pop()}|${row.column}`, row]),
);
for (const [table, [, columns]] of Object.entries(tables)) {
  for (const column of columns) {
    const base = original[`${table.split("/").pop()}|${column}`];
    if (table !== "data/programs.csv" && table !== "data/items.csv") continue;
    if (hubColumns.includes(column)) continue;
    if (!base) throw Error(`no package description for ${table} ${column}`);
    // public_review is the package's own review state, not a column property.
    const kept = { ...base, table };
    delete kept.public_review;
    dictionary.push(kept);
  }
}
const P = "data/programs.csv";
dict(
  P,
  "분류",
  "Hub 지원 분류 9개 중 하나(사이트 '무엇이 필요하세요?' 버튼)",
  "string",
  categories.map((c) => c["이름"]).join(";"),
);
dict(
  P,
  "받는방식",
  "지원형태를 4개로 묶은 값(사이트 '어떻게 받나' 버튼)",
  "string",
  Object.keys(site.ways).join(";"),
);
dict(
  P,
  "신청주체_구분",
  "신청하는 쪽. 대상단위에서 정함. 둘 다면 '사업주;근로자'",
  "string",
  "사업주;근로자",
);
dict(
  P,
  "대상업종_KSIC",
  "대상업종을 KSIC 11차 대·중분류 코드로 편 값. 대분류 전체가 맞으면 문자 하나. '전체'는 업종 제한 없음. 한글 업종명 대응은 임시표",
  "string(;구분)",
);
dict(P, "지역_시도", "사업 지역의 시·도. '전국'이면 지역 제한 없음", "string");
dict(
  P,
  "지역_세부",
  "시·군·구까지 한정된 사업의 지역(예: '울산 북구'). 아니면 빈칸",
  "string",
);
dict(
  P,
  "건설현장_한정",
  "근로자 수 기준 없이 공사금액으로만 대상을 정하는 건설현장 사업이면 Y",
  "string",
  "Y;N",
);
dict(
  P,
  "지원금액_요약",
  "사이트 카드에 보이는 금액 요약(지원비율·한도·금리·보험료 인하). 원 값에서 계산",
  "string",
);
const F = "data/program_filters.csv";
dict(F, "사업ID", "programs.csv의 사업ID", "string");
dict(
  F,
  "필터",
  "필터 이름",
  "string",
  "분류;받는방식;지원형태;신청주체;업종;지역;유해인자_필요;위험요인;기관구분",
);
dict(
  F,
  "값",
  "이 사업이 들어가는 필터 값. 사업 하나가 여러 값에 들어갈 수 있다(업종·위험요인·신청주체)",
  "string",
);
for (const [table, cols] of [
  ["data/categories.csv", ["순서", "분류", "설명", "사업수"]],
  ["data/ways.csv", ["순서", "받는방식", "지원형태", "사업수"]],
  ["data/ksic.csv", ["코드", "이름", "상위"]],
  ["data/synonyms.csv", ["묶음", "낱말"]],
])
  for (const c of cols)
    dict(
      table,
      c,
      `${table.split("/").pop()} — ${c}`,
      /순서|사업수|묶음/.test(c) ? "integer" : "string",
    );

await mkdir(join(out, "data"), { recursive: true });
const written = [];
async function put(path, text, rows = "") {
  const bytes = Buffer.from(text, "utf8");
  await writeFile(join(out, path), bytes);
  written.push({
    path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    rows,
  });
}
for (const [path, [rows, columns]] of Object.entries(tables))
  await put(path, csv(rows, columns), rows.length);
await put(
  "data_dictionary.csv",
  csv(dictionary, [
    "table",
    "column",
    "description",
    "type",
    "nullable",
    "missing_value",
    "unit",
    "allowed_values",
    "origin",
    "key",
  ]),
  dictionary.length,
);

// ---- programs.jsonl: one programme per line, grouped so an AI can tell what each value is --
// Sections: 식별 · 라벨(Hub filters) · 원분류 · 대상요건 · 지원내용 · 기관 · 신청 · 근거 · 품목 · 설명.
// Empty cells are null, numbers are numbers, Y/N cells are booleans, ';' lists are arrays.
const SECTIONS = {
  식별: ["사업ID", "기준연도", "사업명", "세부사업명"],
  원분류: ["지원범주", "지원유형", "지원형태"],
  대상요건: [
    "대상단위",
    "근로자수_하한",
    "근로자수_상한_미만",
    "근로자수_기준",
    "규모조건_결합",
    "공사금액_상한_억원_미만",
    "대상업종",
    "대상업종_분류체계",
    "제외업종",
    "지역",
    "산재보험_가입필요",
    "보험료체납_제외",
    "유해인자_보유필요",
    "유해인자_종류",
    "기타대상조건",
    "제외대상",
    "원문_대상표현",
  ],
  지원내용: [
    "지원비율_최대_퍼센트",
    "지원비율_비고",
    "지원한도_원",
    "한도단위",
    "추가한도_원",
    "추가한도_조건",
    "최소사업비_원",
    "원청부담",
    "중복지원_제한",
    "기지원_차감",
    "지원횟수",
    "시설개선_기한_개월",
    "융자금리_퍼센트",
    "거치_년",
    "분할상환_년",
    "보험료_인하_퍼센트",
    "혜택기간_년",
  ],
  기관: ["소관기관", "수행기관", "기관구분"],
  신청: [
    "신청방법",
    "문의처",
    "공식링크",
    "공식링크_종류",
    "신청링크",
    "링크확인",
    "링크_비고",
  ],
  근거: ["검증상태", "근거URL", "출처ID"],
};
// 위험요인 goes to 라벨 as a list; every other package column sits in exactly one section.
const placed = [...Object.values(SECTIONS).flat(), "위험요인"];
const unplaced = sourceColumns.filter((c) => !placed.includes(c));
const doubled = placed.filter((c, i) => placed.indexOf(c) !== i);
if (unplaced.length || doubled.length)
  throw Error(`jsonl sections: unplaced ${unplaced} doubled ${doubled}`);

function typed(table, column, value) {
  if (value === "" || value === undefined) return null;
  const spec = original[`${table}|${column}`] ?? {};
  if (/^Y\|N$|^N\|Y$/.test(spec.allowed_values ?? "") || column === "관리품목")
    return value === "Y";
  // "미기재" means the source does not say; it is not "no".
  if (spec.allowed_values === "Y|미기재") return value === "Y" ? true : null;
  if (spec.type === "integer" && /^-?\d+$/.test(value)) return Number(value);
  if (spec.type === "number" && /^-?\d+(\.\d+)?$/.test(value))
    return Number(value);
  return value;
}
const section = (r, columns) =>
  Object.fromEntries(columns.map((c) => [c, typed("programs.csv", c, r[c])]));
const itemsOf = {};
for (const i of items)
  (itemsOf[i["사업ID"]] ??= []).push(
    Object.fromEntries(
      Object.keys(i)
        .filter((c) => !["사업ID", "사업명", "세부사업명"].includes(c))
        .map((c) => [
          c,
          c === "위험요인" ? split(i[c]) : typed("items.csv", c, i[c]),
        ]),
    ),
  );

function sizeText(r) {
  if (site.applicant(r) === "근로자")
    return "근로자 본인 신청(사업장 규모 무관)";
  const parts = [];
  if (r["근로자수_하한"]) parts.push(`${r["근로자수_하한"]}인 이상`);
  if (r["근로자수_상한_미만"])
    parts.push(
      `${r["근로자수_상한_미만"]}인 미만` +
        (r["규모조건_결합"].startsWith("또는_")
          ? `(또는 ${r["규모조건_결합"].split("_")[1]})`
          : ""),
    );
  if (r["공사금액_상한_억원_미만"])
    parts.push(`공사금액 ${r["공사금액_상한_억원_미만"]}억원 미만 현장`);
  return parts.length ? parts.join(", ") : "규모 제한 없음";
}
// A fixed template over the row's own values; nothing is generated or inferred.
function describe(r) {
  const region = r["지역_시도"] === "전국" ? "전국" : r["지역"];
  const industry =
    r["대상업종_KSIC"] === "전체"
      ? "업종 제한 없음"
      : `업종 ${r["대상업종"]}(KSIC ${r["대상업종_KSIC"].replaceAll(";", ", ")})`;
  const hazard =
    r["유해인자_보유필요"] === "Y"
      ? ` 유해인자 보유 필요(${r["유해인자_종류"] || "종류 미기재"}).`
      : "";
  const money =
    r["지원금액_요약"] ||
    (r["지원형태"] === "무상서비스" ? "무상 서비스" : "금액 미기재");
  return (
    `${r["세부사업명"]}(${r["사업명"]}) — 분류 ${r["분류"]}, ${r["받는방식"]}(${r["지원형태"]}). ` +
    `신청 ${r["신청주체_구분"].replace(";", "·")}, ${region}, ${industry}, ${sizeText(r)}.${hazard} ` +
    `지원 ${money}. 소관 ${r["소관기관"]}, 근거 ${r["검증상태"]}, 기준연도 ${r["기준연도"]}.`
  );
}

const lines = labelled.map((r) =>
  JSON.stringify({
    사업ID: r["사업ID"],
    설명: describe(r),
    라벨: {
      분류: r["분류"],
      받는방식: r["받는방식"],
      신청주체: split(r["신청주체_구분"]),
      업종_KSIC: split(r["대상업종_KSIC"]),
      지역_시도: r["지역_시도"],
      지역_세부: r["지역_세부"] || null,
      유해인자_필요: r["유해인자_보유필요"] === "Y",
      건설현장_한정: r["건설현장_한정"] === "Y",
      위험요인: split(r["위험요인"]),
    },
    식별: section(r, SECTIONS.식별),
    원분류: section(r, SECTIONS.원분류),
    대상요건: section(r, SECTIONS.대상요건),
    지원내용: {
      요약: r["지원금액_요약"] || null,
      ...section(r, SECTIONS.지원내용),
    },
    기관: section(r, SECTIONS.기관),
    신청: section(r, SECTIONS.신청),
    근거: section(r, SECTIONS.근거),
    품목: itemsOf[r["사업ID"]] ?? [],
  }),
);
await put("data/programs.jsonl", lines.join("\n") + "\n", lines.length);

const jsonType = (table, c) => {
  const spec = original[`${table}|${c}`] ?? {};
  if (
    /^Y\|N$|^N\|Y$/.test(spec.allowed_values ?? "") ||
    spec.allowed_values === "Y|미기재" ||
    c === "관리품목"
  )
    return ["boolean", "null"];
  if (spec.type === "integer") return ["integer", "string", "null"];
  if (spec.type === "number") return ["number", "string", "null"];
  return ["string", "null"];
};
const props = (columns, table = "programs.csv") =>
  Object.fromEntries(
    columns.map((c) => [
      c,
      {
        type: jsonType(table, c),
        description: original[`${table}|${c}`]?.description ?? "",
      },
    ]),
  );
const obj = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const list = { type: "array", items: { type: "string" } };
await put(
  "data/programs.schema.json",
  JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: `programs.jsonl 한 줄 (${VERSION})`,
      description:
        "지원사업 1건. 라벨은 사이트 필터 값, 나머지 묶음은 원 패키지 칸을 뜻별로 나눈 것. 정수·숫자 칸은 원문이 범위·문구면 문자열로 남는다.",
      ...obj({
        사업ID: { type: "string" },
        설명: {
          type: "string",
          description: "행 값으로 채운 고정 문장(생성·추론 없음)",
        },
        라벨: obj({
          분류: { enum: categories.map((c) => c["이름"]) },
          받는방식: { enum: Object.keys(site.ways) },
          신청주체: { type: "array", items: { enum: ["사업주", "근로자"] } },
          업종_KSIC: {
            ...list,
            description:
              "'전체' 또는 ksic.csv 코드. 대분류 문자는 그 아래 중분류 전부",
          },
          지역_시도: { type: "string", description: "'전국' 또는 시·도" },
          지역_세부: { type: ["string", "null"] },
          유해인자_필요: { type: "boolean" },
          건설현장_한정: { type: "boolean" },
          위험요인: list,
        }),
        식별: obj(props(SECTIONS.식별)),
        원분류: obj(props(SECTIONS.원분류)),
        대상요건: obj(props(SECTIONS.대상요건)),
        지원내용: obj({
          요약: {
            type: ["string", "null"],
            description: "사이트 카드의 금액 요약",
          },
          ...props(SECTIONS.지원내용),
        }),
        기관: obj(props(SECTIONS.기관)),
        신청: obj(props(SECTIONS.신청)),
        근거: obj(props(SECTIONS.근거)),
        품목: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ...props(
                Object.keys(items[0]).filter(
                  (c) =>
                    !["사업ID", "사업명", "세부사업명", "위험요인"].includes(c),
                ),
                "items.csv",
              ),
              위험요인: list,
            },
          },
        },
      }),
    },
    null,
    2,
  ) + "\n",
);

const perCategory = categories
  .map(
    (c) =>
      `| ${c["이름"]} | ${count((r) => r["분류"] === c["이름"])} | ${c["설명"]} |`,
  )
  .join("\n");
await put(
  "README.md",
  `# 안전보건 지원사업 요건 데이터셋 — Hub 판 ${VERSION}

자료 ID \`osh-support-programs\` · 판 **${VERSION}** (${DATE}) · 원 패키지 v${catalogue.version}(${catalogue.version_date}) + Hub 라벨 · serving \`${catalogue.release}\` · \`real\`(실제 자료)

가공·라벨: OSH AI Hub 제작(자료 제작자 ukbyun). 행 값은 각 기관이 공개한 공고·보도자료·안내 페이지에서 읽었고 행마다 근거 URL이 있다.

osh.ai.kr **지원사업 찾기** 화면이 쓰는 자료 전부다. 사업 ${programs.length}건마다 원 요건 칸과 함께, 화면의 필터(분류·받는 방식·신청 주체·업종·지역·유해인자)에 어디 해당하는지를 라벨로 붙였다. 이 파일들과 판정 규칙만으로 화면을 다시 만들 수 있다.

## 파일

| 파일 | 행 | 내용 |
|---|---|---|
| \`data/programs.jsonl\` | ${programs.length} | **AI용.** 사업 1건 = JSON 1줄. 라벨·요건·지원내용·품목이 뜻별 묶음으로 한 줄에 |
| \`data/programs.schema.json\` | — | programs.jsonl 한 줄의 JSON Schema(칸 설명 포함) |
| \`data/programs.csv\` | ${programs.length} | 사업 1건 = 1행. 원 패키지 칸 ${sourceColumns.length}개 + Hub 라벨 ${hubColumns.length}개(${hubColumns.join(", ")}) |
| \`data/program_filters.csv\` | ${filters.length} | (사업, 필터, 값) 긴 표. 사업이 들어가는 모든 필터 값 |
| \`data/items.csv\` | ${items.length} | 지정 지원품목(안전보건공단 재정지원 8개 사업만) |
| \`data/categories.csv\` | ${categories.length} | 분류 9개 — 순서·설명·사업 수 |
| \`data/ways.csv\` | ${Object.keys(site.ways).length} | 받는 방식 4개와 묶은 지원형태 |
| \`data/ksic.csv\` | ${ksic.length} | 업종 선택지(KSIC 11차 대분류 21 + 중분류 77) |
| \`data/synonyms.csv\` | ${site.synonyms.length} | 검색 동의어 묶음 |
| \`data_dictionary.csv\` | ${dictionary.length} | 칸 설명. 원 패키지 칸은 원 설명 그대로 |
| \`files.csv\` | — | 파일별 크기·SHA-256 |

## 분류

| 분류 | 사업 수 | 설명 |
|---|---|---|
${perCategory}

분류는 자료 제작자가 2026-10-01 정했다. 원 패키지의 \`지원범주\`(9개)도 programs.csv에 그대로 있다.

## AI가 읽는 법

- **먼저 \`data/programs.jsonl\`.** 한 줄이 사업 하나다. 줄마다 \`설명\`(행 값으로 채운 고정 문장) → \`라벨\`(필터 값) → 원 칸 묶음(\`식별\`·\`원분류\`·\`대상요건\`·\`지원내용\`·\`기관\`·\`신청\`·\`근거\`) → \`품목\` 순서다. 검색해서 넣기(RAG)에는 줄 단위로 자르면 된다.
- **값의 뜻**: \`null\`은 원문에 없음(0이나 "해당 없음"이 아니다). \`라벨.업종_KSIC = ["전체"]\`·\`라벨.지역_시도 = "전국"\`은 제한 없음. 대분류 문자(예: \`C\`)는 그 아래 중분류 전부. Y/N 칸은 true/false.
- **"받을 수 있나"는 라벨만으로 정하지 않는다.** \`대상요건\`의 근로자 수·규모 결합·업종·지역·유해인자 조건과 \`기타대상조건\`·\`제외대상\`을 함께 본다. 사이트 판정 규칙은 \`rules.ts\`의 \`judge()\`.
- **신청기간·예산은 없다.** \`신청.공식링크\`·\`신청.신청링크\`에서 최신 공고를 확인하라고 안내한다.
- 칸 뜻은 \`programs.schema.json\`의 description, 표 형식은 \`data_dictionary.csv\`.

## 화면 재구성

1. **판정**(받을 수 있음·확인 필요·해당 안 됨): 근로자 수(\`근로자수_하한\`·\`근로자수_상한_미만\`·\`규모조건_결합\`과 기업 규모), 업종(\`대상업종\`·\`제외업종\`), 지역(\`지역\`), 유해인자(\`유해인자_보유필요\`), 건설현장(\`공사금액_상한_억원_미만\`), 신청 주체(\`대상단위\`). 규칙 원문: 공개 저장소 \`web/demo/osh-support-programs/rules.ts\`의 \`judge()\`·\`evaluate()\`.
2. **필터**: \`program_filters.csv\`에서 \`필터=분류\`·\`받는방식\`로 목록을 고른다. 버튼 수는 판정 결과(해당+해당 안 됨)를 센다.
3. **검색**: \`rules.ts\`의 \`searchFields\` 칸 + 품목명·품목구분·위험요인을 이어 붙이고 띄어쓰기·구분 기호를 지운 글에서 찾는다. \`synonyms.csv\`의 같은 묶음은 같은 말로 본다. 검색은 순위만 바꾸고 사업을 지우지 않는다.
4. **목록 순서**: 검색어 일치 수 → 판정 단계(받을 수 있음 → 사업장 상황 조건 → 확인 필요 → 근로자 본인 신청 → 지역 한정) 순으로 묶고, **같은 묶음 안에서는 방문마다 무작위**다. 위에 놓였다는 이유만으로 더 눌리는 편향을 덜어 수요 기록을 공정하게 읽기 위해서다.
5. **AI 조건 채우기**는 자료가 아니라 기능이다(Claude가 설명을 읽어 위 필터 값을 제안). 이 데이터셋에 들어 있지 않다.

## 알아 둘 것

- 신청기간·접수상태·잔여예산은 담지 않는다. 행마다 \`공식링크\`·\`신청링크\`에서 확인한다.
- \`대상업종_KSIC\`는 한글 업종명 ↔ KSIC 임시 대응표로 만든 값이다. 정식 대응표로 바꾸면 달라질 수 있다.
- 값 근거 수준은 \`검증상태\`(공식·포털안내·언론 등). 언론·민간 근거 행은 공고 원문 대조가 남아 있다.
- 별도 라이선스 표기는 두지 않는다(제작자 결정, 2026-10-01). 원문은 각 기관의 공개 문서다.
- 수요 로그(방문자 기록)는 이 데이터셋에 넣지 않았다.
`,
);
await put(
  "files.csv",
  csv(written, ["path", "bytes", "sha256", "rows"]),
  written.length,
);
console.log(
  `${VERSION}: ${programs.length} programmes, ${filters.length} filter rows → ${out}`,
);
