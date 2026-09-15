import Link from 'next/link';
import { Bot, ArrowLeft, ClipboardCheck } from 'lucide-react';
import { loadAdminIntelligenceView } from '@/lib/intelligence/admin-view';
import { agentReadiness, RESEARCH_AGENT_STAGES } from '@/lib/intelligence/agent-readiness';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ایجنت‌های پژوهش | پنل مدیریت', robots: { index: false, follow: false } };
export default async function AgentsPage() {
  const view = await loadAdminIntelligenceView();
  const checks = agentReadiness({ unavailableReason: view.unavailableReason, daysRecorded: view.rehearsal.daysRecorded });
  const labels = { observed: 'شاهد موجود است', missing: 'تکمیل نشده', unknown: 'احراز نشده' };
  return <div className="mx-auto max-w-6xl space-y-6" style={{ color: 'var(--text)' }}>
    <header className="space-y-3">
      <Bot size={28} aria-hidden="true" />
      <h1 className="font-display text-2xl font-extrabold">ایجنت‌های پژوهش</h1>
      <p className="max-w-3xl text-base leading-8">نقشهٔ ایجنت رصد و پژوهش: چه ورودی می‌گیرد، چه چیزی تحویل می‌دهد و کجا بازبینی انسانی لازم است.</p>
      <div className="rounded-xl border p-4 text-sm leading-7" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
        وضعیت این قابلیت: طراحی و آماده‌سازی. این صفحه اجرای زندهٔ مدل را نشان نمی‌دهد و ایجنتی را فعال نمی‌کند.
      </div>
    </header>
    <section aria-labelledby="agent-stages" className="space-y-4">
      <h2 id="agent-stages" className="text-lg font-bold">یک جریان پژوهش، سه مرحله</h2>
      <div className="grid gap-4 lg:grid-cols-3">{RESEARCH_AGENT_STAGES.map(stage => <article key={stage.title} className="card space-y-4 p-5">
        <h3 className="text-base font-bold">{stage.title}</h3>
        <dl className="space-y-3 text-sm leading-7"><div><dt className="font-bold">ورودی</dt><dd>{stage.input}</dd></div><div><dt className="font-bold">خروجی مورد انتظار</dt><dd>{stage.output}</dd></div></dl>
        <p className="border-t pt-3 text-sm leading-7" style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }}>{stage.boundary}</p>
      </article>)}</div>
    </section>
    <section className="card space-y-4 p-5" aria-labelledby="agent-checks">
      <h2 id="agent-checks" className="flex items-center gap-2 text-lg font-bold"><ClipboardCheck size={20} aria-hidden="true" /> آمادگی مسیر</h2>
      <p className="text-sm leading-7">وجود داده یا ده روز تمرین، مجوز اجرای خودکار نیست. وضعیت مدل و تصویب منابع مستقل بررسی می‌شود.</p>
      <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>{checks.map(check => <li key={check.key} className="grid gap-2 py-4 sm:grid-cols-[220px_1fr]">
        <div><h3 className="text-sm font-bold">{check.title}</h3><p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>{labels[check.state]}</p></div>
        <p className="text-sm leading-7">{check.detail}</p>
      </li>)}</ul>
    </section>
    <section className="grid gap-4 sm:grid-cols-2" aria-label="ادامهٔ کار">
      <Link className="card flex min-h-16 items-center justify-between gap-3 p-5 focus-visible:outline focus-visible:outline-2" href="/admin/research"><span>نوشتن تحلیل و سناریو در کاربرگ پژوهش</span><ArrowLeft size={20} aria-hidden="true" /></Link>
      <Link className="card flex min-h-16 items-center justify-between gap-3 p-5 focus-visible:outline focus-visible:outline-2" href="/admin/intelligence"><span>گردش تحلیل و بازبینی انسانی</span><ArrowLeft size={20} aria-hidden="true" /></Link>
    </section>
  </div>;
}
