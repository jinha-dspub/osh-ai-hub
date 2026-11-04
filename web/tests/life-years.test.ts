import { describe, expect, it } from "vitest";
import {
  filterDatasets,
  lifeYearsDataset,
  visibleDatasets,
} from "../lib/catalog";

describe("life years dataset", () => {
  it("is visible and searchable as a DEMO guide without pretending to provide real aggregates", () => {
    const published = visibleDatasets(false);
    expect(published).toContain(lifeYearsDataset);
    expect(filterDatasets({ q: "손실연수" }, published)).toContain(
      lifeYearsDataset,
    );
    expect(lifeYearsDataset.isReal).toBeFalsy();
    expect(lifeYearsDataset.description).toContain(
      "실제 반출 집계자료는 포함하지 않습니다",
    );
    expect(lifeYearsDataset.title).toContain("DEMO");
  });
});
