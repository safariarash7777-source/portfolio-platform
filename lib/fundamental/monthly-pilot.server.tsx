import "server-only";
import artifact from "./monthly-preview-snapshot.json";
import {approvedPreviewBuild} from "./approved-preview-build.mjs";
import {pilotScope, type PilotSnapshot} from "./monthly-preview-display";

const drillDownSymbol = "فولاد";
const snapshot = artifact as PilotSnapshot | null;

/** Server-only static module; no request-time database or browser fetch. */
export async function readApprovedMonthlyPilot(): Promise<PilotSnapshot | null> {
  if (!approvedPreviewBuild(process.env)) return null;
  return snapshot?.commit === process.env.VERCEL_GIT_COMMIT_SHA
    ? snapshot : {commit: "", state: "unavailable", rows: []};
}

const fa = (num: number) => new Intl.NumberFormat("fa-IR", {maximumFractionDigits:2}).format(num);
const digits = (s: string) => s.replace(/\d/g, n => "۰۱۲۳۴۵۶۷۸۹"[Number(n)]);
export function MonthlyPilot({snapshot, symbol}: {snapshot: PilotSnapshot | null; symbol?: string}) {
  if (!snapshot || (symbol !== undefined && symbol !== drillDownSymbol)) return null;
  const rows = snapshot.rows.filter(row => symbol === undefined || row.symbol === symbol);
  const available = snapshot.state === "complete";
  return (
    <section aria-label="پایلوت تطبیق گزارش‌های ماهانه" data-monthly-pilot-state={available ? "complete" : "unavailable"}
      data-monthly-pilot-version={pilotScope.version} className="card my-4 space-y-2 p-4">
      <h2 className="font-display text-lg font-bold">پایلوت تطبیق گزارش‌های ماهانه</h2>
      <p className="text-sm">مهر {digits(pilotScope.current.slice(0, 4))} در برابر مهر {digits(pilotScope.baseline.slice(0, 4))}. این بررسی محدود، پوشش کل بازار نیست.</p>
      {!available ? (
        <p role="status" className="text-sm">تطبیق این دو دوره فعلاً در دسترس نیست. این وضعیت به معنی فروش صفر یا نبود گزارش نیست.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(row => {
            const ratio = row.ratio;
            return (
              <li key={row.symbol}>
                <h3 className="font-bold">{row.symbol}</h3>
                <p className="text-xs">{row.symbol === "کی بی سی" ? "درآمد شناسایی‌شدهٔ خدمات و فروش" : "فروش کل شرکت"}</p>
                <ul className="text-sm">
                  {([["current",pilotScope.current],["baseline",pilotScope.baseline]] as const).map(([which,month]) => {
                    const point = row[which];
                    return point ? (
                      <li key={which} data-pilot-point={which} data-pilot-record={point.rowId}>
                        {digits(month)}: {fa(point.amountMillionIrr)} میلیون ریال
                        {" · "}<a className="underline" href={point.sourceUrl} target="_blank" rel="noreferrer">منبع کدال، رکورد {fa(point.rowId)}</a>
                      </li>
                    ) : <li key={which}>{digits(month)}: مبلغ تأیید نشده</li>;
                  })}
                </ul>
                <p className="text-sm">{ratio === null || ratio === undefined ? "رشد مقایسه‌ای تأیید نشده" : <>تغییر دو دوره: <bdi>{fa(ratio)}٪</bdi></>}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
