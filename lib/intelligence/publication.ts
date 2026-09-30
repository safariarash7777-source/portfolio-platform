import { isCalendarDate, isSourceUrl } from './research-workbook';

export const PUBLICATION_CONTRACT = 'publication.v1';
export type PublicationAction = 'ready' | 'publish' | 'withdraw';
export interface PublicationDraft {
  workbookVersionId: string;
  contentKind: 'brief' | 'lesson' | 'webinar_plan';
  title: string; summary: string; content: string;
  sources: { url: string; asOf: string }[];
  audience: 'public' | 'cohort'; cohortIds: string[];
  channels: ('site' | 'telegram')[];
}
export interface PublicationRow extends PublicationDraft {
  id: string; publicationId: string; version: number; createdAt: string;
  state: 'draft' | 'ready' | 'published' | 'withdrawn' | 'approval_invalid';
  approvalCurrent: boolean;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function publicationId(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error('شناسه معتبر نیست.');
  return value;
}
export function parsePublication(input: unknown): PublicationDraft {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('محتوا معتبر نیست.');
  const p = input as Record<string, unknown>;
  const text = (key: string, max: number) => {
    const v = p[key]; if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`فیلد ${key} کامل نیست.`);
    return v.trim();
  };
  if (!['brief', 'lesson', 'webinar_plan'].includes(String(p.contentKind))) throw new Error('نوع محتوا را انتخاب کنید.');
  if (!['public', 'cohort'].includes(String(p.audience))) throw new Error('مخاطب را انتخاب کنید.');
  if (!Array.isArray(p.cohortIds) || p.cohortIds.length > 20) throw new Error('دوره‌ها معتبر نیستند.');
  const cohortIds = [...new Set(p.cohortIds.map(publicationId))];
  if ((p.audience === 'public' && cohortIds.length !== 0) || (p.audience === 'cohort' && cohortIds.length === 0)) throw new Error('مخاطب و دوره با هم سازگار نیستند.');
  if (!Array.isArray(p.channels) || !p.channels.length || p.channels.some(c => c !== 'site' && c !== 'telegram')) throw new Error('کانال را انتخاب کنید.');
  const channels = [...new Set(p.channels)] as PublicationDraft['channels'];
  // Every distributed item has an addressable site version; Telegram carries only a link.
  if (!channels.includes('site')) throw new Error('نسخه سایت برای مشاهده و اصلاح محتوا لازم است.');
  if (!Array.isArray(p.sources) || p.sources.length < 1 || p.sources.length > 20) throw new Error('حداقل یک منبع تاریخ‌دار لازم است.');
  const sources = p.sources.map(value => {
    if (!value || typeof value !== 'object') throw new Error('منبع معتبر نیست.');
    const s = value as Record<string, unknown>;
    if (typeof s.url !== 'string' || s.url.length > 2000 || !isSourceUrl(s.url) || typeof s.asOf !== 'string' || !isCalendarDate(s.asOf)) throw new Error('نشانی و تاریخ منبع معتبر نیستند.');
    return { url: s.url.trim(), asOf: s.asOf };
  });
  return { workbookVersionId: publicationId(p.workbookVersionId), contentKind: p.contentKind as PublicationDraft['contentKind'], title: text('title', 300), summary: text('summary', 2000), content: text('content', 20000), sources, audience: p.audience as PublicationDraft['audience'], cohortIds, channels };
}
export function publicationCommand(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('فرمان معتبر نیست.');
  const p = input as Record<string, unknown>;
  const key = publicationId(p.idempotencyKey);
  if (p.action === 'save') {
    if (typeof p.baseVersion !== 'number' || !Number.isInteger(p.baseVersion) || p.baseVersion < 0) throw new Error('نسخه پایه معتبر نیست.');
    return { rpc: 'save_research_publication', args: { p_publication: p.publicationId == null ? null : publicationId(p.publicationId), p_base: p.baseVersion, p_body: parsePublication(p.draft), p_key: key } };
  }
  if (!['ready', 'publish', 'withdraw'].includes(String(p.action))) throw new Error('فرمان معتبر نیست.');
  if (typeof p.reason !== 'string' || p.reason.trim().length < 5 || p.reason.length > 2000) throw new Error('دلیل این اقدام را بنویسید.');
  if (p.action !== 'withdraw' && p.privacyConfirmed !== true) throw new Error('متن مخاطب و نبود اطلاعات خصوصی را بازبینی کنید.');
  return { rpc: 'command_research_publication', args: { p_version: publicationId(p.versionId), p_action: p.action, p_reason: p.reason.trim(), p_key: key, p_privacy_confirmed: p.privacyConfirmed === true } };
}
export function canReadPublication(row: PublicationRow, grantedCohorts: readonly string[]): boolean {
  return row.state === 'published' && row.approvalCurrent && (row.audience === 'public' || row.cohortIds.some(id => grantedCohorts.includes(id)));
}
export function publicationFailure(error: { code?: string } | null) {
  const code = error?.code;
  const status = code === 'PT409' || code === '23505' ? 409 : code === '42501' ? 403 : code === '22023' ? 422 : code === 'P0002' ? 404 : 503;
  return { status, error: status === 409 ? 'نسخه یا فرمان تغییر کرده است؛ دوباره دریافت کنید.' : status === 403 ? 'این اقدام مجاز نیست.' : status === 422 ? 'محتوا، منبع یا تأیید نسخه کامل نیست.' : status === 404 ? 'محتوا در دسترس نیست.' : 'دفتر انتشار در دسترس نیست؛ متن شما حفظ شده است.' };
}
