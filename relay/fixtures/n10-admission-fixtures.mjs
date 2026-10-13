// Synthetic acceptance fixtures; the real Vanovin fixture remains unmodified.
export const meta = { symbol: "نمونه", company_name: "شرکت نمونه", period_end: "1404-03-31", period_months: 3, audited: false };
export const table = rows => `<table>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
export const container = (rows, title, description = "ارقام به میلیون ریال") =>
  `<div class="table-containet"><div class="table-title">${title}</div><div class="table-description">${description}</div><app-table>${table(rows)}</app-table></div>`;
export function industrial(options = {}) {
  const scope = options.scope ?? "جداگانه شرکت اصلی";
  const period = options.period ?? "1404/03/31";
  const months = options.months ?? 3;
  const prior = options.prior !== false;
  const current = options.current ?? [100, "(60)", 40, 30, 20];
  const before = options.before ?? [80, "(50)", 30, 20, 10];
  const labels = ["درآمدهای عملیاتی", "بهای تمام شده درآمد", "سود(زیان) ناخالص", "سود(زیان) عملیاتی", "سود(زیان) خالص"];
  const rows = [["شرح", `دوره ${months} ماهه منتهی به ${period}`, ...(prior ? ["دوره 3 ماهه منتهی به 1403/03/31"] : [])],
    ...labels.map((label, i) => [label, current[i], ...(prior ? [before[i]] : [])])];
  if (options.eps !== false) rows.push(["سود(زیان) خالص هر سهم – ریال", options.eps ?? 2, ...(prior ? [options.priorEps ?? 1] : [])]);
  const income = container(rows, `صورت سود و زیان ${scope}`, options.unit ?? "ارقام به میلیون ریال");
  const capital = options.capital === false ? "" : container([
    ["شرح", "سرمایه"], [`مانده در ${options.capitalPeriod ?? period}`, options.capital ?? 500],
  ], `صورت تغییرات حقوق مالکانه ${options.capitalScope ?? scope} - دوره ${months} ماهه منتهی به ${options.capitalPeriod ?? period}`, options.capitalUnit ?? "ارقام به میلیون ریال");
  return income + capital;
}
export function bank(options = {}) {
  const rows = [["شرح", "دوره 3 ماهه منتهی به 1404/03/31", "دوره 3 ماهه منتهی به 1403/03/31"],
    ["درآمد تسهیلات اعطایی", 100, 80], ["درآمد عملیاتی", 100, 80],
    ["هزینه سود سپرده‌ها", "(60)", "(50)"], ["سود(زیان) ناخالص", 40, 30],
    ["سود(زیان) عملیاتی", 30, 20], ["سود(زیان) خالص", 20, 10],
    ["سود(زیان) خالص هر سهم – ریال", options.eps ?? 2, options.priorEps ?? 1],
    ["سرمایه", options.capital ?? 500, 400]];
  return container(rows, `صورت سود و زیان ${options.scope ?? "جداگانه شرکت اصلی"}`, options.unit ?? "ارقام به میلیون ریال");
}
