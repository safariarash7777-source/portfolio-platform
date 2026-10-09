import { formatToman, toPersianDigits } from "@/lib/format";
import type { buildBalanceSheet } from "@/lib/portfolio/balanceSheet";
export default function BalanceSheetSummary({ sheet, version }: { sheet: ReturnType<typeof buildBalanceSheet>; version: number | null }) {
  const values = [
    { label: "ارزش دارایی‌های دارای ارزش‌گذاری", value: sheet.assetValue, help: "ارزش چیزهایی که دارید، فقط برای اقلام دارای قیمت یا ارزش اظهارشده و متناسب با سهم مالکیت شما." },
    { label: "مجموع بدهی‌های ثبت‌شده", value: sheet.debtValue, help: "ماندهٔ پولی که طبق ثبت شما باید پرداخت شود. قسط بعدی بخشی از همین بدهی است و دوباره به آن اضافه نمی‌شود." },
    { label: sheet.partial ? "خالص ثروت جزئی در اطلاعات ثبت‌شده" : sheet.estimated ? "خالص ثروت تخمینی در اطلاعات ثبت‌شده" : "خالص ثروت در اطلاعات ثبت‌شده", value: sheet.netWorth, help: "ارزش دارایی‌های دارای ارزش‌گذاری منهای بدهی‌های ثبت‌شده. عدد منفی یعنی بدهی ثبت‌شده از این دارایی‌ها بیشتر است." },
  ];
  return <section className="card p-5 space-y-4" aria-label="خلاصهٔ وضعیت مالی ثبت‌شده">
    <h2 className="font-display text-xl font-bold">وضعیت مالی ثبت‌شده {version !== null && `· نسخهٔ ${toPersianDigits(version)}`}</h2>
    <p className="text-sm leading-7">این تصویر فقط اطلاعاتی را پوشش می‌دهد که اینجا ثبت کرده‌اید؛ با کل ثروت شما یکسان فرض نمی‌شود. همهٔ ارقام به تومان نمایش داده می‌شوند؛ هر تومان برابر ۱۰ ریال است.</p>
    <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">{values.map(row => <div key={row.label} className="rounded-xl p-4 space-y-2" style={{ background: "var(--surface-2)" }}><dt className="text-sm font-bold">{row.label}</dt><dd className="text-xl font-bold" style={{ color: row.value !== null && row.value < 0 ? "var(--danger)" : "var(--navy-deep)" }}>{row.value === null ? "قابل محاسبه نیست" : formatToman(row.value)}</dd><dd className="text-xs leading-6">{row.help}</dd></div>)}</dl>
    {sheet.partial && <p className="text-sm leading-7" role="alert">اطلاعات ناقص یا در دسترس نیست. جمع جزئی فقط اقلام دارای ارزش‌گذاری را در بر می‌گیرد؛ دارایی نامعلوم حذف یا صفر نشده است. این عدد «کل ثروت شما» نیست.</p>}
    {sheet.estimated && <p className="text-sm leading-7" role="alert">این نتیجه شامل ارزش‌گذاری تخمینی است؛ منبع و تاریخ هر قلم را بررسی کنید.</p>}
    <p className="text-xs leading-7">مبلغ‌ها مربوط به تاریخ ثبت‌شدهٔ هر ارزش‌گذاری و مانده‌اند، نه لزوماً امروز. نبود بدهی در فهرست فقط یعنی بدهی ثبت نشده است؛ به معنی نداشتن بدهی نیست.</p>
  </section>;
}
