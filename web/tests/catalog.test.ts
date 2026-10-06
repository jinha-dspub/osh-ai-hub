import { describe, it, expect } from "vitest";
import {
  datasets,
  filterDatasets,
  findDataset,
  sampleCsv,
} from "../lib/catalog";
import { safeReturnPath } from "../lib/auth";
import { pagination } from "../lib/api";
describe("catalog search", () => {
  it("normalizes whitespace and combines filters", () => {
    expect(filterDatasets({ q: "직업 성암" }).map((d) => d.slug)).toEqual([
      "occupational-cancer",
    ]);
    expect(
      filterDatasets({ category: "산업재해", ai: "true", api: "true" }).map(
        (d) => d.slug,
      ),
    ).toEqual(["accident-narratives"]);
  });
  it("does not silently return all rows for an unknown category", () => {
    expect(filterDatasets({ category: "unknown" })).toEqual([]);
    expect(findDataset("../../etc/passwd")).toBeUndefined();
  });
  it("has unique ids and complete sample variable definitions", () => {
    expect(new Set(datasets.map((d) => d.slug)).size).toBe(datasets.length);
    for (const d of datasets) {
      for (const row of d.sample)
        expect(Object.keys(row).sort()).toEqual(
          d.variables.map((v) => v.name).sort(),
        );
    }
  });
  it("escapes quotes and commas in CSV", () => {
    const d = {
      ...datasets[0],
      variables: [{ name: "value", description: "", unit: "" }],
      sample: [{ value: 'a,"b"\nc' }],
    };
    expect(sampleCsv(d)).toBe('"value"\r\n"a,""b""\nc"\r\n');
  });
});
describe("request boundaries", () => {
  it.each(["0", "-1", "1.2", "abc", "101", "Infinity"])(
    "rejects invalid limit %s",
    (limit) => {
      expect(pagination(new URLSearchParams({ limit }))).toBeNull();
    },
  );
  it("bounds page size", () => {
    expect(pagination(new URLSearchParams())).toEqual({ page: 1, limit: 10 });
    expect(pagination(new URLSearchParams({ limit: "100" }))).toEqual({
      page: 1,
      limit: 100,
    });
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil"])(
    "rejects unsafe redirects %s",
    (path) => {
      expect(safeReturnPath(path)).toBe("/account");
    },
  );
  it("allows internal return paths", () => {
    expect(safeReturnPath("/datasets?q=test")).toBe("/datasets?q=test");
  });
});

describe("support programme dataset visibility", () => {
  it("lists the support programme dataset for every visitor once published", async () => {
    const { visibleDatasets, supportProgramsPublic } = await import(
      "../lib/catalog"
    );
    const slugs = (admin: boolean) => visibleDatasets(admin).map((d) => d.slug);
    expect(slugs(true)).toContain("osh-support-programs");
    expect(slugs(false).includes("osh-support-programs")).toBe(
      supportProgramsPublic,
    );
  });
});

describe("corporate safety and health disclosures visibility", () => {
  it("lists the dataset for every visitor once published", async () => {
    const { visibleDatasets, corporateOhsPublic } = await import(
      "../lib/catalog"
    );
    const slugs = (admin: boolean) => visibleDatasets(admin).map((d) => d.slug);
    expect(slugs(true)).toContain("corporate-ohs-disclosures");
    expect(slugs(false).includes("corporate-ohs-disclosures")).toBe(
      corporateOhsPublic,
    );
  });
});

describe("KOSHA GUIDE GraphRAG dataset visibility", () => {
  it("stays an admin draft until the owner opens it", async () => {
    const { visibleDatasets, koshaGraphragPublic } = await import(
      "../lib/catalog"
    );
    const slugs = (admin: boolean) => visibleDatasets(admin).map((d) => d.slug);
    expect(slugs(true)).toContain("kosha-guide-graphrag");
    expect(slugs(false).includes("kosha-guide-graphrag")).toBe(
      koshaGraphragPublic,
    );
  });
});

describe("precedents and synonym vocabulary visibility", () => {
  it("lists both datasets for every visitor once published", async () => {
    const { visibleDatasets, precedentsPublic, synonymVocabPublic } =
      await import("../lib/catalog");
    const slugs = (admin: boolean) => visibleDatasets(admin).map((d) => d.slug);
    for (const [slug, flag] of [
      ["osh-precedents", precedentsPublic],
      ["osh-synonym-vocab", synonymVocabPublic],
    ] as const) {
      expect(slugs(true)).toContain(slug);
      expect(slugs(false).includes(slug)).toBe(flag);
    }
  });
});
