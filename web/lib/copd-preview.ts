// Approved public preview: only four selected fields from the first three CSV rows.
// Snapshot: 2026-09-19.v1; hazards display | as comma. Verified unchanged fields. Never import the full private dataset into web/.
export const copdPreview = [
  {
    "year": "2016",
    "approval": "불인정",
    "occupation": "광원",
    "hazards": "석탄 분진, 결정형 유리규산 분진, 질소산화물 가스, 시멘트 분진"
  },
  {
    "year": "2016",
    "approval": "인정",
    "occupation": "광원",
    "hazards": "텅스텐 원석 분진, 중석가루, 석탄 분진, 암석 분진, 결정형 유리규산 분진, 질소산화물 가스"
  },
  {
    "year": "2016",
    "approval": "불인정",
    "occupation": "광원",
    "hazards": "석탄분진, 결정형 유리규산 분진, 질소산화물 가스"
  }
] as const;
