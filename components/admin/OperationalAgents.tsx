import { loadOperationalAgentsView, type OperationalState } from '@/lib/intelligence/operational-agents-view';
import { formatJalali, formatTehranClock, toPersianDigits } from '@/lib/format';

const labels: Record<OperationalState, string> = { ok: 'بررسی ثبت‌شده موفق', stale: 'نیازمند تازه‌سازی', failed: 'بررسی ناموفق', unknown: 'نامشخص' };
const roles = { data_quality: 'پایش کیفیت داده', site_monitor: 'پایش سایت', coordinator: 'هماهنگی اجراها' };
function dateLabel(value: string): string {
  return `${formatJalali(value)}، ساعت ${formatTehranClock(value)} تهران`;
}

/** Server component; the monitoring records are private and never become model instructions. */
export default async function OperationalAgents() {
  const view = await loadOperationalAgentsView();
  return <section className="space-y-4" aria-labelledby="operational-agents-title">
    <header className="space-y-2">
      <h2 id="operational-agents-title" className="text-lg font-bold">پایش داده، سایت و هماهنگی اجراها</h2>
      <p className="text-sm leading-7">این بخش نتیجهٔ بررسی‌های زمان‌بندی‌شده با قواعد مشخص را نشان می‌دهد؛ با پژوهش زبانی Hermes تفاوت دارد. وجود گزارش، فعال بودن فعلی اجراکننده را اثبات نمی‌کند.</p>
      <p className="text-sm leading-7" style={{ color: 'var(--text-2)' }}>از {toPersianDigits(60)} رکورد اخیر، تازه‌ترین گزارش هر نقش نمایش داده می‌شود. بیش از {toPersianDigits(30)} دقیقه بدون گزارش تازه، پیگیری اجراکننده را لازم می‌کند. زمان‌ها هنگام باز شدن صفحه ارزیابی می‌شوند.</p>
      {view.unavailableReason && <p role="status" className="rounded-lg border p-3 text-sm leading-7" style={{ borderColor: 'var(--line)' }}>{view.unavailableReason}</p>}
    </header>
    <div className="space-y-4">{view.agents.map(agent => <article key={agent.role} className="card space-y-4 p-5">
      <header className="space-y-2">
        <h3 className="font-bold">{roles[agent.role]}</h3>
        <p className="text-sm font-bold">وضعیت: {labels[agent.state]}</p>
        {agent.createdAt && <p className="text-sm leading-7">آخرین ثبت: {dateLabel(agent.createdAt)}</p>}
        {agent.heartbeatStale && <p role="status" className="text-sm leading-7">بیش از {toPersianDigits(30)} دقیقه از آخرین ثبت گذشته است؛ ادامهٔ اجرای پایش احراز نشده است. نتیجهٔ ثبت‌شده: {agent.recordedState ? labels[agent.recordedState] : labels.unknown}.</p>}
        {agent.unavailableReason && <p className="text-sm leading-7">{agent.unavailableReason}</p>}
      </header>
      {agent.report && <>
        <p className="whitespace-pre-wrap text-sm leading-8">{agent.report.summary}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-right text-sm leading-7">
            <caption className="pb-2 text-right font-bold">بررسی‌های ثبت‌شدهٔ {roles[agent.role]}</caption>
            <thead><tr className="border-b" style={{ borderColor: 'var(--line)' }}><th scope="col" className="p-2">بررسی</th><th scope="col" className="p-2">نتیجه</th><th scope="col" className="p-2">جزئیات</th></tr></thead>
            <tbody>{agent.report.checks.map(check => <tr key={check.key} className="border-b align-top" style={{ borderColor: 'var(--line)' }}>
              <th scope="row" className="p-2 font-medium">{check.label}</th><td className="p-2">{labels[check.state]}</td><td className="whitespace-pre-wrap p-2">{toPersianDigits(check.detail)}{check.lastAt && <p className="mt-1" style={{ color: 'var(--text-2)' }}>زمان شاهد: {dateLabel(check.lastAt)}</p>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {agent.report.checks.length === 0 && <p className="text-sm leading-7">جزئیات بررسی در این گزارش ثبت نشده است.</p>}
        <section className="space-y-2" aria-label={`پیگیری‌های ${roles[agent.role]}`}>
          <h4 className="text-sm font-bold">موارد نیازمند پیگیری در گزارش</h4>
          {agent.report.actions.length ? <ul className="list-inside list-disc space-y-2 text-sm leading-7">{agent.report.actions.map((action, index) => <li key={index}>{action}</li>)}</ul> : <p className="text-sm leading-7">موردی در این گزارش ثبت نشده است.</p>}
          <p className="text-sm leading-7" style={{ color: 'var(--text-2)' }}>موارد بالا فقط متن گزارش‌اند؛ نمایش آن‌ها به معنی انجام اقدام یا رفع مشکل نیست.</p>
        </section>
      </>}
    </article>)}</div>
  </section>;
}
