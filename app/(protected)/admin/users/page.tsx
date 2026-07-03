import UsersModule from "@/components/admin/UsersModule";

export const metadata = {
  title: "کاربران",
};

const RISK_ALLOWED = ["محافظه‌کار", "متعادل", "تهاجمی", "بسیار تهاجمی"];

function normRisk(r?: string): string {
  return r && RISK_ALLOWED.includes(r) ? r : "";
}
function normQuiz(q?: string): string {
  return q === "done" || q === "pending" ? q : "";
}
function normPage(p?: string): number {
  const n = Number(p);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ risk?: string; quiz?: string; page?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <header>
        <span className="eyebrow">پنل مدیریت</span>
        <h1
          className="font-display text-2xl md:text-3xl font-bold mt-1"
          style={{ color: "var(--navy-deep)" }}
        >
          کاربران
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
          جست‌وجو، فیلتر، خروجی CSV و مشاهدهٔ جزئیات هر کاربر.
        </p>
      </header>

      <UsersModule
        initialRisk={normRisk(sp.risk)}
        initialQuiz={normQuiz(sp.quiz)}
        initialPage={normPage(sp.page)}
      />
    </div>
  );
}
