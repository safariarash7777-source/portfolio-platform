'use client';
import { useState } from 'react';
import P07ManualDesk from './P07ManualDesk';
import { p07RenderResearch } from './P07DeskIntegration';
import { createP07WorkflowFixture, p07FixtureWorkbook } from '@/lib/intelligence/p07-workflow-fixture';

function ScenarioWorkspace() {
  const [generation, setGeneration] = useState(0);
  const [fixture, setFixture] = useState(createP07WorkflowFixture);
  return <section className="space-y-4"><div className="card p-4 space-y-3"><p className="font-bold">P07 · سه گردش ساختگی؛ اطلاعات و اقدام‌ها فقط در حافظه همین نمونه‌اند.</p><div className="flex flex-wrap gap-3"><button className="btn btn-secondary min-h-11" onClick={() => { if (window.confirm('نمونه و تغییرهای ثبت‌نشده پاک شوند؟')) { setFixture(createP07WorkflowFixture()); setGeneration(value => value + 1); } }}>شروع دوباره نمونه</button><button className="btn btn-secondary min-h-11" onClick={() => fixture.failNext(503)}>خطای دریافت بعدی</button><button className="btn btn-secondary min-h-11" onClick={() => fixture.failNext(409)}>تعارض نسخه در درخواست بعدی</button></div><ol className="list-decimal list-inside leading-8"><li>متن نمونه، گزاره و شاهد را ثبت؛ کاربرگ را ذخیره و همان نسخه را تأیید کنید. متن مخاطب را بسازید، پیش‌نمایش همین نسخه را بررسی و انتشار ساختگی را اجرا کنید.</li><li>فرض پژوهش را اصلاح، نسخه تازه کاربرگ را ذخیره و تأیید کنید؛ در همان انتشار پژوهش تازه را انتخاب و متن مخاطب را اصلاح کنید.</li><li>با دلیل انسانی نمونه انتشار را متوقف کنید؛ تاریخچه نمونه محفوظ می‌ماند.</li></ol><p>این گردش‌ها پذیرش واقعی آرش یا اجرای SQL/مجوز native نیستند.</p></div><P07ManualDesk key={generation} transport={fixture.transport} sample initialWorkbook={p07FixtureWorkbook()} renderResearch={p07RenderResearch}/></section>;
}
export default function P07DeskScenario() {
  return process.env.NODE_ENV === 'development' ? <ScenarioWorkspace/> : <p>نمونه فقط در محیط توسعه فعال است.</p>;
}
