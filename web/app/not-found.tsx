import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container not-found">
      <p className="eyebrow">404 · NOT FOUND</p>
      <h1>요청한 페이지를 찾을 수 없어요</h1>
      <p>주소를 확인하거나 데이터 목록에서 다시 찾아보세요.</p>
      <Link href="/datasets" className="button">
        데이터 찾기로 이동
      </Link>
    </div>
  );
}
