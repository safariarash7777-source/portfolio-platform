import type { Metadata } from "next";
import RiskProfileQuiz from "./RiskProfileQuiz";

export const metadata: Metadata = {
  title: "آزمون سنجش ریسک | پلتفرم هوشمند پرتفوی",
  description: "با پاسخ به ۱۵ سوال تخصصی، پروفایل ریسک خود را بسنجید و یک سبد سرمایه‌گذاری اختصاصی دریافت کنید.",
};

export default function RiskProfilePage() {
  return <RiskProfileQuiz />;
}
