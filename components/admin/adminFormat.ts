// کمک‌تابع‌های قالب‌بندی برای داشبورد ادمین — ارقام فارسی و RTL.

const faInt = new Intl.NumberFormat("fa-IR");
const faWeek = new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "short" });

/** عدد صحیح با ارقام فارسی؛ برای مقدار نامعتبر «—». */
export function faNum(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return faInt.format(n);
}

/** درصد گرد‌شده با ارقام فارسی؛ برای مقدار نامعتبر «—». */
export function faPercent(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${faInt.format(Math.round(n))}٪`;
}

/** «X از Y» با ارقام فارسی. */
export function faRatio(part: number, total: number): string {
  return `${faNum(part)} از ${faNum(total)}`;
}

/** برچسب هفته مثل «۱۴ تیر» از یک تاریخِ ISO. */
export function faWeekLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return faWeek.format(d);
}
