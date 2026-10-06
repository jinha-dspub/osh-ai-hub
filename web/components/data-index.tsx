import type { ReactNode } from "react";

// Data index of a dataset intro page: what each table is, and where its source was downloaded.
// Uses OSH Family classes, so the page must import osh-family.css and sit inside .osh-app.
export type IndexTable = {
  name: string;
  file?: { label: string; href: string };
  size: string;
  row: string;
  source: string;
};
export type IndexSource = {
  name: string;
  href?: string;
  got: string;
  terms: string;
};

export function DataIndex({
  lead,
  tables,
  sources,
  note,
  children,
}: {
  lead: string;
  tables: readonly IndexTable[];
  sources: readonly IndexSource[];
  note?: string;
  children?: ReactNode;
}) {
  return (
    <section className="osh-section" id="data-index">
      <h2 className="osh-heading">데이터 색인</h2>
      <p className="osh-copy">{lead}</p>
      <div
        className="osh-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="데이터 색인: 자료별 규모와 원천"
      >
        <table className="osh-table">
          <thead>
            <tr>
              <th>자료</th>
              <th>규모</th>
              <th>한 행의 뜻</th>
              <th>원천</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.name}>
                <td>
                  <strong>{t.name}</strong>
                  {t.file && (
                    <>
                      <br />
                      <a className="osh-link" href={t.file.href} download>
                        {t.file.label}
                      </a>
                    </>
                  )}
                </td>
                <td>{t.size}</td>
                <td>{t.row}</td>
                <td>{t.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {children}
      <h3 className="osh-card-title" style={{ marginTop: 32 }}>
        원천을 받은 곳
      </h3>
      <div
        className="osh-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="원천을 받은 곳과 이용 조건"
      >
        <table className="osh-table">
          <thead>
            <tr>
              <th>원천</th>
              <th>받은 날·방법</th>
              <th>이용 조건</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.name}>
                <td>
                  {s.href ? (
                    <a
                      className="osh-link"
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.name}
                    </a>
                  ) : (
                    s.name
                  )}
                </td>
                <td>{s.got}</td>
                <td>{s.terms}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="osh-help">{note}</p>}
    </section>
  );
}
