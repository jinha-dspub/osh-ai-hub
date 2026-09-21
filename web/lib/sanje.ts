import catalog from "./sanje-catalog.json";
export { catalog as sanjeCatalog };
export type SanjeStudy = (typeof catalog.groups)[number];
export const studyPage = (id: string) =>
  id === "copd" ? "/datasets/copd" : `/datasets/sanje/${id}`;
export const studyDemo = (id: string) =>
  id === "copd" ? "/demo/copd/" : `/demo/sanje/${id}/`;
export const getStudy = (id: string) =>
  catalog.groups.find((study) => study.id === id);
