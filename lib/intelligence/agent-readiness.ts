/** Readiness is not execution permission. No provider calls or automatic state transitions. */
export type ReadinessState = 'observed' | 'missing' | 'unknown';
export interface ReadinessItem { key: string; title: string; state: ReadinessState; detail: string; }
export function agentReadiness(input: { unavailableReason: string | null; daysRecorded: number }): ReadinessItem[] {
  const readable = input.unavailableReason === null;
  return [
    { key: 'workflow', title: 'دسترسی به گردش تحلیل', state: readable ? 'observed' : 'unknown', detail: readable ? 'خواندن نمای گردش موفق بوده؛ این به معنی آزمون نوشتن یا انتشار نیست.' : input.unavailableReason! },
    { key: 'rehearsal', title: 'تمرین جریان دستی', state: !readable ? 'unknown' : input.daysRecorded >= 10 ? 'observed' : 'missing', detail: !readable ? 'روزهای تمرین قابل سنجش نیست.' : input.daysRecorded >= 10 ? 'حداقل ده روز ثبت شده؛ پذیرش رسمی و کیفیت تمرین باید جداگانه بررسی شود.' : 'حداقل ده روز واقعی برای ارزیابی جریان دستی لازم است.' },
    { key: 'sources', title: 'منابع مجاز و مجموعهٔ ارزیابی', state: 'unknown', detail: 'تصویب منابع و مجموعهٔ تحلیل‌های واقعی در این صفحه احراز نشده است.' },
    { key: 'provider', title: 'مدل، هزینه و مسیر دسترسی', state: 'unknown', detail: 'تأمین‌کننده و بودجهٔ اجرا در این صفحه احراز نشده است.' },
    { key: 'runtime', title: 'اجرای ایجنت پژوهش', state: 'missing', detail: 'این بسته نقشهٔ نقش‌ها و آمادگی را اضافه می‌کند؛ زمان‌بند و فراخوانی مدل ندارد.' },
  ];
}
export const RESEARCH_AGENT_STAGES = [
  { title: 'رصد رخداد', input: 'منابع تأییدشده و زمان مشاهده', output: 'رخداد نامزد با نشانی منبع', boundary: 'منبع ناشناخته، شاهد تأییدشده محسوب نمی‌شود.' },
  { title: 'استخراج شواهد', input: 'متن قابل استناد و تاریخ انتشار', output: 'گزارهٔ متصل به شاهد، همراه محدودیت', boundary: 'متن منبع داده است؛ دستور اجرایی برای ایجنت نیست.' },
  { title: 'آماده‌سازی تحلیل', input: 'شواهد و ورودی کیفی موتور موجود', output: 'پیش‌نویس، سه سناریو و شرط ابطال', boundary: 'تأیید، انتشار و تغییر سبد در اختیار ایجنت قرار نمی‌گیرد.' },
] as const;
