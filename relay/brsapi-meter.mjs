/**
 * قلابِ شمارشِ BrsApi برای ماژول‌هایی که **در زنجیرهٔ فراخوانیِ سرور عمیق‌اند**.
 *
 * ── چرا این فایل وجود دارد ──────────────────────────────────────────────────
 * `countLegacy` را می‌شود به‌عنوان پارامتر به تابع داد — و برای مسیرهای کم‌عمق
 * (`symbol-detail`) همان کار شده. ولی برای کدال زنجیره سه لایه است
 * (`server → codal-engine/codal-archive → codal.fetchAnnouncementsPage`) و
 * عبورِ یک پارامتر از سه امضا فقط برای شمردن، امضاها را به‌ازای یک نگرانیِ
 * عرضی آلوده می‌کند. این ماژول همان وابستگی را یک‌جا و **قابلِ‌مشاهده** می‌کند.
 *
 * ── چرا «قلابِ سراسری» اینجا خطرِ معمولش را ندارد ───────────────────────────
 * خطرِ همیشگیِ قلابِ سراسری این است که کسی ثبتش را فراموش کند و مصرف بی‌صدا
 * نامرئی بماند. پس نبودِ قلاب **سکوت نیست**: هر فراخوانیِ بی‌قلاب در
 * `unregistered` شمرده می‌شود و در `/debug` دیده می‌شود. همان قاعدهٔ
 * `LegacyMeter.unmetered`: حتی «نشمردن» یک عدد دارد.
 *
 * ── قرارداد ────────────────────────────────────────────────────────────────
 * `meterBrsapi` را **پیش از** `fetch` صدا بزن. در حالتِ اجرا
 * (`BRSAPI_BUDGET_ENFORCE_LEGACY=1`) وقتی بودجه اجازه ندهد پرتاب می‌کند، و
 * چون پیش از `fetch` است یعنی درخواست واقعاً فرستاده نمی‌شود.
 */

/** @type {null | ((producer: string, budgetClass?: string) => Promise<void>)} */
let meter = null;
const unregistered = Object.create(null);

/** ثبتِ شمارنده. `null` قلاب را برمی‌دارد (برای تست‌ها). */
export function setBrsapiMeter(fn) {
  meter = typeof fn === "function" ? fn : null;
}

/** یک تلاشِ واقعیِ upstream را ثبت می‌کند. هر retry یک فراخوانیِ جداست. */
export async function meterBrsapi(producer, budgetClass = "standard") {
  if (!meter) {
    unregistered[producer] = (unregistered[producer] ?? 0) + 1;
    return;
  }
  await meter(producer, budgetClass);
}

export function brsapiMeterSnapshot() {
  return { hooked: meter !== null, unregistered: { ...unregistered } };
}

/** فقط برای تست — شمارندهٔ بی‌قلاب را صفر می‌کند. */
export function resetBrsapiMeterForTest() {
  meter = null;
  for (const k of Object.keys(unregistered)) delete unregistered[k];
}
