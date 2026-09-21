import { SanjeIntroduction } from "@/components/sanje-introduction";
import { getStudy } from "@/lib/sanje";
export const metadata = { title: "COPD 산재 판정 사례" };
export default function CopdPage() {
  return <SanjeIntroduction study={getStudy("copd")!} />;
}
