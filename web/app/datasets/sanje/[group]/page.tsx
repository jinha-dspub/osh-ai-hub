import { notFound } from "next/navigation";
import { SanjeIntroduction } from "@/components/sanje-introduction";
import { getStudy, sanjeCatalog } from "@/lib/sanje";
export const dynamicParams = false;
export function generateStaticParams() {
  return sanjeCatalog.groups.map((group) => ({ group: group.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const study = getStudy((await params).group);
  return { title: study?.title || "자료를 찾을 수 없습니다" };
}
export default async function DiseasePage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const study = getStudy((await params).group);
  if (!study) notFound();
  return <SanjeIntroduction study={study} />;
}
