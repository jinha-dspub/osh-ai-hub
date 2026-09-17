export default function Loading() {
  return (
    <div
      className="container loading-shell"
      role="status"
      aria-label="페이지 불러오는 중"
    >
      <div className="loading-bar" style={{ width: "30%" }} />
      <div className="loading-bar" style={{ width: "70%" }} />
      <div className="loading-bar" style={{ height: 200 }} />
    </div>
  );
}
