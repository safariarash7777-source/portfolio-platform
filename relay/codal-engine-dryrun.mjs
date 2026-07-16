// دراى‌ران کامل یک چرخهٔ موتور v3 در سندباکس (خارج از ایران):
// excel.codal.ir از خارج در دسترس نیست، پس فقط مسیر کشف (فید+بک‌فیل) و
// وضعیت پایدار تست می‌شود؛ دانلود اکسل قطعاً شکست می‌خورد و باید در دفتر
// خطا ثبت شود — خودِ این هم بخشی از تست است (شمارندهٔ شکست).
// اجرا: BRSAPI_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DRY=1 node codal-engine-dryrun.mjs
import { runEngineCycle, engineStatus } from "./codal-engine.mjs";

console.log("engine dry-run cycle starting…");
const t0 = Date.now();
await runEngineCycle();
console.log(`cycle done in ${Math.round((Date.now() - t0) / 1000)}s`);
console.log(JSON.stringify(engineStatus, null, 2));
