/**
 * ذخیره، بازکردن و نسخهٔ دومِ کاربرگِ پژوهش + تأییدِ داخلیِ انسانی — #142.
 *
 * همان الگوی `service.ts`: وابستگی‌ها تزریق می‌شوند و مخزن (`createStore`) یک
 * factory است تا تست ثابت کند در مسیرهای ۴۰۱/۴۰۳ **اصلاً ساخته نمی‌شود**.
 *
 * قواعد:
 *  ۱. بدنه هرگز همان‌طور که کلاینت فرستاده ذخیره نمی‌شود؛ از `parseWorkbook`
 *     می‌گذرد که فقط فیلدهای شناخته‌شده را بازمی‌سازد (وضعیت/تأییدِ جعلی دور
 *     ریخته می‌شود). هنگامِ بازکردن هم دوباره پارس می‌شود — ردیفِ دیتابیس هم
 *     ورودیِ غیرقابل‌اعتماد است.
 *  ۲. پیش‌نویس می‌تواند ناقص باشد، ولی نشانیِ منبعِ **نوشته‌شده** باید http(s)
 *     معتبر باشد: `javascript:` یا نشانیِ دارای رمز حتی در پیش‌نویس ذخیره نمی‌شود.
 *  ۳. هر ذخیره نسخهٔ تازه است. کلاینت نسخهٔ پایه‌اش را می‌گوید؛ اگر کسی زودتر
 *     نسخهٔ بعدی را ساخته باشد، ۴۰۹ — نه بازنویسیِ بی‌صدا.
 *  ۴. «تأییدِ داخلی» فقط برای آخرین نسخه و فقط وقتی چک‌لیستِ ساختار صفر مورد
 *     دارد. تأیید ≠ انتشار؛ اینجا هیچ مسیرِ انتشاری نیست.
 */

import {
  isSourceUrl,
  parseWorkbook,
  reviewWorkbook,
  type ResearchWorkbook,
} from "@/lib/intelligence/research-workbook";

export const MAX_STORED_BYTES = 1_000_000;

export type WorkbookDecision = "approved_internal" | "returned";

export interface StoredVersion {
  id: string;
  workbookId: string;
  version: number;
  title: string;
  body: unknown;
  createdAt: string;
}
export interface StoredReview {
  id: string;
  versionId: string;
  decision: WorkbookDecision;
  note: string | null;
  reviewedAt: string;
}

/** خطای شناخته‌شدهٔ مخزن؛ هر چیزِ دیگر به پیامِ عمومی سقوط می‌کند. */
export class StoreError extends Error {
  constructor(readonly code: "conflict" | "unavailable" | "no_evidence" | "not_found") {
    super(code);
  }
}

export interface WorkbookStore {
  /** تازه‌ترین نسخه‌ها (هر کاربرگ ممکن است چند ردیف داشته باشد)، بدونِ بدنه. */
  recent(limit: number): Promise<Omit<StoredVersion, "body">[]>;
  versions(workbookId: string): Promise<StoredVersion[]>;
  reviews(versionIds: string[]): Promise<StoredReview[]>;
  insertVersion(row: { workbookId: string; version: number; title: string; body: ResearchWorkbook }): Promise<StoredVersion>;
  insertReview(row: { versionId: string; decision: WorkbookDecision; note: string | null }): Promise<StoredReview>;
}

export interface WorkbookGateway {
  getUser(): Promise<{ id: string } | null>;
  getRole(userId: string): Promise<string | null>;
  createStore(): WorkbookStore;
  newId(): string;
}

export interface StoreResult {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 413 | 422 | 500 | 503;
  body: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorize(gateway: WorkbookGateway): Promise<StoreResult | null> {
  const user = await gateway.getUser();
  if (!user) return { status: 401, body: { error: "ورود لازم است" } };
  let role: string | null;
  try {
    role = await gateway.getRole(user.id);
  } catch {
    return { status: 403, body: { error: "دسترسی مجاز نیست" } };
  }
  return role === "admin" ? null : { status: 403, body: { error: "دسترسی مجاز نیست" } };
}

function failure(error: unknown): StoreResult {
  if (error instanceof StoreError) {
    if (error.code === "conflict") {
      return { status: 409, body: { error: "نسخهٔ تازه‌تری از این کاربرگ ثبت شده است؛ آن را باز کنید و تغییرات را دوباره اعمال کنید." } };
    }
    if (error.code === "unavailable") {
      return { status: 503, body: { error: "ذخیرهٔ سروری هنوز فعال نیست؛ تا اجرای زیرساخت از فایل استفاده کنید.", unavailable: true } };
    }
    if (error.code === "no_evidence") {
      return { status: 422, body: { error: "نسخهٔ بدون شاهدِ منبع‌دار و تاریخ‌دار تأیید نمی‌شود." } };
    }
    return { status: 404, body: { error: "کاربرگ پیدا نشد" } };
  }
  return { status: 500, body: { error: "خطای داخلی؛ متن روی صفحه حفظ شده است." } };
}

/** پارسِ دوباره از رشته: همان مسیرِ واردکردنِ فایل، با همان سقف‌ها. */
function sanitize(input: unknown): ResearchWorkbook | string {
  let parsed: ResearchWorkbook;
  try {
    parsed = parseWorkbook(JSON.stringify(input ?? null));
  } catch (error) {
    return error instanceof Error ? error.message : "ساختار کاربرگ معتبر نیست.";
  }
  for (const e of parsed.evidence) {
    if (e.sourceUrl.trim() && !isSourceUrl(e.sourceUrl.trim())) {
      return `نشانیِ منبعِ شاهدِ ${e.id} معتبر نیست؛ فقط http یا https بدونِ نام کاربری و رمز.`;
    }
  }
  if (!parsed.title.trim()) return "برای ذخیره، عنوانِ تحلیل لازم است.";
  if (parsed.title.length > 300) return "عنوانِ تحلیل حداکثر ۳۰۰ نویسه است.";
  return parsed;
}

/**
 * از میانِ ردیف‌های تازه، برای هر کاربرگ فقط بالاترین نسخه — جدیدترین اول.
 * PostgREST نه `DISTINCT ON` دارد نه `GROUP BY`، پس این کار اینجاست.
 */
export function latestPerWorkbook<T extends { workbookId: string; version: number; createdAt: string }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const prev = best.get(r.workbookId);
    if (!prev || r.version > prev.version) best.set(r.workbookId, r);
  }
  return [...best.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listWorkbooks(gateway: WorkbookGateway): Promise<StoreResult> {
  const denied = await authorize(gateway);
  if (denied) return denied;
  try {
    const rows = latestPerWorkbook(await gateway.createStore().recent(500)).slice(0, 50);
    return {
      status: 200,
      body: {
        items: rows.map((r) => ({ workbookId: r.workbookId, version: r.version, title: r.title, savedAt: r.createdAt })),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function openWorkbook(
  gateway: WorkbookGateway,
  workbookId: string,
  version: number | null,
): Promise<StoreResult> {
  const denied = await authorize(gateway);
  if (denied) return denied;
  if (!UUID.test(workbookId)) return { status: 400, body: { error: "شناسهٔ کاربرگ نامعتبر است" } };
  if (version !== null && (!Number.isInteger(version) || version < 1)) {
    return { status: 400, body: { error: "شمارهٔ نسخه نامعتبر است" } };
  }
  try {
    const store = gateway.createStore();
    const all = (await store.versions(workbookId)).sort((a, b) => a.version - b.version);
    if (all.length === 0) return { status: 404, body: { error: "کاربرگ پیدا نشد" } };
    const target = version === null ? all[all.length - 1] : all.find((v) => v.version === version);
    if (!target) return { status: 404, body: { error: "این نسخه پیدا نشد" } };
    let workbook: ResearchWorkbook;
    try {
      workbook = parseWorkbook(JSON.stringify(target.body));
    } catch {
      // ردیفی که پارس نمی‌شود نمایش داده نمی‌شود؛ حدس‌زدنِ فیلدها یعنی عددِ ساختگی.
      return { status: 422, body: { error: "این نسخه ساختارِ معتبر ندارد و باز نمی‌شود." } };
    }
    const reviews = await store.reviews(all.map((v) => v.id));
    const byVersion = new Map(all.map((v) => [v.id, v.version]));
    return {
      status: 200,
      body: {
        workbookId,
        version: target.version,
        latestVersion: all[all.length - 1].version,
        savedAt: target.createdAt,
        workbook,
        openIssues: reviewWorkbook(workbook).length,
        versions: all.map((v) => ({ version: v.version, savedAt: v.createdAt })),
        reviews: reviews
          .map((r) => ({ version: byVersion.get(r.versionId) ?? null, decision: r.decision, note: r.note, reviewedAt: r.reviewedAt }))
          .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt)),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function saveWorkbook(
  gateway: WorkbookGateway,
  payload: { workbookId?: unknown; baseVersion?: unknown; workbook?: unknown },
): Promise<StoreResult> {
  const denied = await authorize(gateway);
  if (denied) return denied;

  const isNew = payload.workbookId === null || payload.workbookId === undefined;
  if (!isNew && (typeof payload.workbookId !== "string" || !UUID.test(payload.workbookId))) {
    return { status: 400, body: { error: "شناسهٔ کاربرگ نامعتبر است" } };
  }
  const base = payload.baseVersion;
  if (typeof base !== "number" || !Number.isInteger(base) || base < 0 || (isNew ? base !== 0 : base < 1)) {
    return { status: 400, body: { error: "نسخهٔ پایه نامعتبر است" } };
  }
  const clean = sanitize(payload.workbook);
  if (typeof clean === "string") return { status: 400, body: { error: clean } };
  if (new TextEncoder().encode(JSON.stringify(clean)).length > MAX_STORED_BYTES) {
    return { status: 413, body: { error: "کاربرگ برای ذخیرهٔ سروری بیش از یک مگابایت است؛ از فایل استفاده کنید." } };
  }

  try {
    const workbookId = isNew ? gateway.newId() : (payload.workbookId as string);
    const row = await gateway.createStore().insertVersion({
      workbookId,
      version: base + 1,
      title: clean.title.trim(),
      body: clean,
    });
    return { status: 201, body: { workbookId: row.workbookId, version: row.version, savedAt: row.createdAt } };
  } catch (error) {
    return failure(error);
  }
}

export async function decideWorkbook(
  gateway: WorkbookGateway,
  payload: { workbookId?: unknown; version?: unknown; decision?: unknown; note?: unknown },
): Promise<StoreResult> {
  const denied = await authorize(gateway);
  if (denied) return denied;
  if (typeof payload.workbookId !== "string" || !UUID.test(payload.workbookId)) {
    return { status: 400, body: { error: "شناسهٔ کاربرگ نامعتبر است" } };
  }
  if (typeof payload.version !== "number" || !Number.isInteger(payload.version) || payload.version < 1) {
    return { status: 400, body: { error: "شمارهٔ نسخه نامعتبر است" } };
  }
  if (payload.decision !== "approved_internal" && payload.decision !== "returned") {
    return { status: 400, body: { error: "تصمیم نامعتبر است" } };
  }
  const note = payload.note === undefined || payload.note === null || payload.note === "" ? null : payload.note;
  if (note !== null && (typeof note !== "string" || note.length > 2000)) {
    return { status: 400, body: { error: "یادداشتِ بازبینی نامعتبر است" } };
  }
  if (payload.decision === "returned" && note === null) {
    return { status: 400, body: { error: "برای بازگرداندن، علت را بنویسید." } };
  }

  try {
    const store = gateway.createStore();
    const all = (await store.versions(payload.workbookId)).sort((a, b) => a.version - b.version);
    const target = all.find((v) => v.version === payload.version);
    if (!target) return { status: 404, body: { error: "این نسخه پیدا نشد" } };
    if (target.version !== all[all.length - 1].version) {
      return { status: 409, body: { error: "فقط آخرین نسخه قابلِ تصمیم است." } };
    }
    if (payload.decision === "approved_internal") {
      let workbook: ResearchWorkbook;
      try {
        workbook = parseWorkbook(JSON.stringify(target.body));
      } catch {
        return { status: 422, body: { error: "این نسخه ساختارِ معتبر ندارد." } };
      }
      const open = reviewWorkbook(workbook).length;
      if (open > 0) {
        return { status: 422, body: { error: "چک‌لیستِ ساختار کامل نیست؛ نسخهٔ ناقص تأیید نمی‌شود.", openIssues: open } };
      }
    }
    const review = await store.insertReview({ versionId: target.id, decision: payload.decision, note: note as string | null });
    return { status: 201, body: { version: target.version, decision: review.decision, reviewedAt: review.reviewedAt } };
  } catch (error) {
    return failure(error);
  }
}

/**
 * نگاشتِ خطای PostgREST/Postgres به `StoreError`. متنِ خام هرگز به کلاینت
 * نمی‌رود؛ فقط کُد و الگوهای شناخته‌شده خوانده می‌شوند.
 */
export function classifyStoreError(error: { code?: string; message?: string } | null): StoreError | Error {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "23505" || /version gap|stale version/i.test(message)) return new StoreError("conflict");
  if (code === "42P01" || code === "PGRST205" || code === "PGRST202") return new StoreError("unavailable");
  if (/approval requires evidence/i.test(message)) return new StoreError("no_evidence");
  if (/version not found/i.test(message)) return new StoreError("not_found");
  return new Error("store failure");
}
