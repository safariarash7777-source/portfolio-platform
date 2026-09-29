// هویتِ کاربر در مسیرِ پرداخت از کجا می‌آید.
//
// نیمهٔ SQLی این خاصیت در `finalize.integration.test.ts` است: شناسهٔ تهی رد
// می‌شود و کاربرِ ناموجود دسترسی نمی‌گیرد. ولی دیتابیس **نمی‌تواند** بداند
// `p_user_id` از یک نشستِ معتبر آمده یا از بدنهٔ درخواست — آن تضمین فقط در
// خودِ مسیر است. پس اینجا می‌سنجیمش.
import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES = [
  "app/api/payment/request/route.ts",
  "app/api/webinars/payment/route.ts",
];

function src(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

test("هر مسیرِ پرداخت هویت را از نشستِ سرور می‌گیرد", () => {
  for (const r of ROUTES) {
    assert.match(src(r), /auth\.getUser\(\)/,
      `${r}: هویت باید از \`supabase.auth.getUser()\` بیاید`);
  }
});

test("هیچ مسیرِ پرداختی شناسهٔ کاربر را از بدنهٔ درخواست نمی‌خواند", () => {
  // اگر روزی کسی `body.user_id` را به `create_payment` بدهد، هر کاربری
  // می‌تواند برای هر کسِ دیگری پرداخت بسازد — و دیتابیس هیچ راهی برای
  // تشخیصش ندارد، چون تابع شناسه را صریح می‌گیرد.
  const bad = /\b(body|payload|json|input|params)\s*(\.|\[['"])\s*(user_?id|userId|uid|sub)\b/i;
  for (const r of ROUTES) {
    const lines = src(r).split("\n");
    const hits = lines
      .map((l, i) => ({ l, i: i + 1 }))
      .filter(({ l }) => bad.test(l) && !l.trim().startsWith("//"));
    assert.deepEqual(hits.map((h) => `${r}:${h.i}`), [],
      `${r}: شناسهٔ کاربر از ورودیِ کاربر خوانده شده`);
  }
});

test("`p_user_id` فقط با شناسهٔ همان نشست پر می‌شود", () => {
  const s = src("app/api/payment/request/route.ts");
  assert.match(s, /p_user_id:\s*user\.id/,
    "باید دقیقاً `user.id` باشد — همان که از `getUser()` آمده");
});

test("مسیر پیش از ساختِ پرداخت، نبودِ کاربر را رد می‌کند", () => {
  for (const r of ROUTES) {
    // خطِ **فراخوانی**، نه خطِ import — نسخهٔ اول این دو را قاطی کرد و
    // مسیرِ درست را مردود اعلام کرد.
    const lines = src(r).split("\n");
    const isImport = (l: string) => /^\s*import\b/.test(l) || /^\s{2,}\w+,?\s*$/.test(l);
    const guard = lines.findIndex((l) => l.includes("if (!user)"));
    const create = lines.findIndex(
      // دو شکلِ فراخوانی: `startWebinarPayment({...})` و `rpc("create_payment", …)`.
      (l) => /\bstartWebinarPayment\s*\(|rpc\(\s*["']create_payment["']/.test(l) && !isImport(l)
    );
    assert.ok(guard >= 0, `${r}: گاردِ «کاربر وارد نشده» ندارد`);
    assert.ok(create >= 0, `${r}: هیچ فراخوانیِ ساختِ پرداختی پیدا نشد`);
    assert.ok(guard < create,
      `${r}: گارد در خطِ ${guard + 1} است ولی ساختِ پرداخت در ${create + 1} — باید پیش از آن باشد`);
  }
});
