/** Preparation for the existing human intelligence workflow; never approval or publication. */
import { INTEL_DOMAINS, type IntelDomain } from './contracts';

export const MAX_WORKBOOK_BYTES = 8_000_000;
export const SCENARIO_KEYS = ['base', 'upside', 'downside'] as const;
export const SCENARIO_NAMES = { base: 'پایه', upside: 'مساعد', downside: 'نامساعد' } as const;
export interface ResearchEvidence {
  id: string; statement: string; sourceUrl: string; observedOn: string; publishedOn: string;
}
export interface ResearchScenario { assumptions: string; mechanism: string; invalidation: string; }
export interface ResearchWorkbook {
  version: 1; title: string; domain: IntelDomain; question: string; horizon: string;
  evidence: ResearchEvidence[]; interpretation: string; counterEvidence: string;
  scenarios: Record<typeof SCENARIO_KEYS[number], ResearchScenario>;
  portfolioImpact: string; reviewOn: string;
}
export function emptyWorkbook(): ResearchWorkbook {
  return { version: 1, title: '', domain: 'macro_ir', question: '', horizon: '',
    evidence: [{ id: 'e1', statement: '', sourceUrl: '', observedOn: '', publishedOn: '' }],
    interpretation: '', counterEvidence: '', scenarios: {
      base: { assumptions: '', mechanism: '', invalidation: '' },
      upside: { assumptions: '', mechanism: '', invalidation: '' },
      downside: { assumptions: '', mechanism: '', invalidation: '' },
    }, portfolioImpact: '', reviewOn: '' };
}
export function isSourceUrl(value: string): boolean {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; }
  catch { return false; }
}
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export interface WorkbookIssue { field: string; message: string; }
/** Structural checklist only: does not verify source contents or analytical truth. */
export function reviewWorkbook(w: ResearchWorkbook): WorkbookIssue[] {
  const issues: WorkbookIssue[] = [];
  const required = (field: string, value: string, message: string) => {
    if (!value.trim()) issues.push({ field, message });
  };
  required('title', w.title, 'عنوان تحلیل را بنویسید.');
  required('question', w.question, 'پرسش تصمیم را مشخص کنید.');
  required('horizon', w.horizon, 'افق تحلیل را مشخص کنید.');
  if (!w.evidence.length) issues.push({ field: 'evidence', message: 'حداقل یک شاهد ثبت کنید.' });
  for (const e of w.evidence) {
    required(`evidence-${e.id}`, e.statement, 'گزارهٔ شاهد را بنویسید.');
    if (!isSourceUrl(e.sourceUrl)) issues.push({ field: `url-${e.id}`, message: 'نشانی معتبر HTTP یا HTTPS برای منبع لازم است.' });
    if (!isCalendarDate(e.observedOn)) issues.push({ field: `observed-${e.id}`, message: 'تاریخ مشاهده را مشخص کنید.' });
    if (!isCalendarDate(e.publishedOn)) issues.push({ field: `published-${e.id}`, message: 'تاریخ انتشار منبع را مشخص کنید.' });
  }
  required('interpretation', w.interpretation, 'زنجیرهٔ علّی و ارتباط آن با شواهد را توضیح دهید.');
  required('counterEvidence', w.counterEvidence, 'شاهد مخالف یا محدودیت جست‌وجوی آن را بنویسید.');
  for (const key of SCENARIO_KEYS) {
    for (const field of ['assumptions', 'mechanism', 'invalidation'] as const) {
      required(`${key}-${field}`, w.scenarios[key][field], `سناریوی ${SCENARIO_NAMES[key]}: فروض، مسیر اثر و شرط ابطال باید کامل باشد.`);
    }
  }
  required('portfolioImpact', w.portfolioImpact, 'اثر احتمالی بر دارایی‌ها و محدودیت تحلیل را بنویسید.');
  if (!isCalendarDate(w.reviewOn)) issues.push({ field: 'reviewOn', message: 'تاریخ بازنگری را مشخص کنید.' });
  return issues;
}

/** Bounded local-file import. Reconstruct known fields; never trust supplied status/approval. */
export function parseWorkbook(text: string): ResearchWorkbook {
  if (new TextEncoder().encode(text).length > MAX_WORKBOOK_BYTES) throw new Error('فایل بیش از حد بزرگ است.');
  const data: unknown = JSON.parse(text);
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('ساختار فایل معتبر نیست.');
    return v as Record<string, unknown>;
  };
  const str = (v: unknown) => { if (typeof v !== 'string' || v.length > 10000) throw new Error('متن فایل معتبر نیست.'); return v; };
  const d = object(data);
  if (d.version !== 1 || !INTEL_DOMAINS.includes(d.domain as IntelDomain)) throw new Error('نسخه یا حوزهٔ فایل معتبر نیست.');
  if (!Array.isArray(d.evidence) || d.evidence.length > 30) throw new Error('حداکثر سی شاهد قابل بارگذاری است.');
  const result = emptyWorkbook();
  result.domain = d.domain as IntelDomain;
  for (const key of ['title', 'question', 'horizon', 'interpretation', 'counterEvidence', 'portfolioImpact', 'reviewOn'] as const) result[key] = str(d[key]);
  const ids = new Set<string>();
  result.evidence = d.evidence.map(v => {
    const e = object(v);
    const id = str(e.id);
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(id) || ids.has(id)) throw new Error('شناسهٔ شاهد نامعتبر یا تکراری است.');
    ids.add(id);
    return { id, statement: str(e.statement), sourceUrl: str(e.sourceUrl), observedOn: str(e.observedOn), publishedOn: str(e.publishedOn) };
  });
  const scenarios = object(d.scenarios);
  for (const key of SCENARIO_KEYS) {
    const s = object(scenarios[key]);
    result.scenarios[key] = { assumptions: str(s.assumptions), mechanism: str(s.mechanism), invalidation: str(s.invalidation) };
  }
  return result;
}
export function workbookMarkdown(w: ResearchWorkbook): string {
  // No HTML rendering. The export remains a draft regardless of checklist result.
  const quote = (v: string) => (v.trim() || 'ثبت نشده').split('\n').map(line => `> ${line}`).join('\n');
  return ['# کاربرگ پژوهش — پیش‌نویس داخلی',
    'این فایل تأیید یا انتشار نشده است. تکمیل ساختار به معنی صحت شواهد نیست.',
    '## عنوان', quote(w.title), '## پرسش تصمیم', quote(w.question), '## افق', quote(w.horizon),
    '## شواهد', ...w.evidence.map((e, i) => `${i + 1}. ${e.id}\n${quote(e.statement)}\n${quote(e.sourceUrl)}\nتاریخ مشاهده: ${e.observedOn || 'ثبت نشده'} · تاریخ انتشار: ${e.publishedOn || 'ثبت نشده'}`),
    '## تفسیر و زنجیرهٔ علّی', quote(w.interpretation), '## شاهد مخالف و محدودیت', quote(w.counterEvidence),
    ...SCENARIO_KEYS.map(key => `## سناریوی ${SCENARIO_NAMES[key]}\nفروض:\n${quote(w.scenarios[key].assumptions)}\nمسیر اثر:\n${quote(w.scenarios[key].mechanism)}\nشرط ابطال:\n${quote(w.scenarios[key].invalidation)}`),
    '## اثر احتمالی بر دارایی‌ها', quote(w.portfolioImpact), '## تاریخ بازنگری', quote(w.reviewOn),
    '## وضعیت بررسی ساختار', `${reviewWorkbook(w).length} مورد نیازمند تکمیل؛ بازبینی انسانی انجام نشده.`,
  ].join('\n\n');
}
