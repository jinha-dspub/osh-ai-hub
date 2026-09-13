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
      expect(safeReturnPath(path)).toBe("/account/api-keys");
    },
  );
  it("allows internal return paths", () => {
    expect(safeReturnPath("/datasets?q=test")).toBe("/datasets?q=test");
  });
});
