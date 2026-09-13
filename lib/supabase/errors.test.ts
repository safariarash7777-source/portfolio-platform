/**
 * تفکیکِ «اجازه ندارم» از «خراب شد» — گاردِ `phase30`.
 *
 * بدونِ این تفکیک، پس‌گرفتنِ عمدیِ یک امتیاز به‌شکلِ یک باگِ ۵۰۰ دیده می‌شود و
 * اولین کسی که آن را ببیند، امتیاز را برمی‌گرداند.
 */
import test from "node:test";
import { strict as assert } from "node:assert";
import { isPermissionDenied, INSUFFICIENT_PRIVILEGE } from "./errors";

test("کدِ ۴۲۵۰۱ یعنی اجازه نیست", () => {
  assert.equal(isPermissionDenied({ code: INSUFFICIENT_PRIVILEGE, message: "x" }), true);
});

test("متنِ خودِ Postgres هم کافی است — چون `code` همیشه پر نمی‌شود", () => {
  assert.equal(
    isPermissionDenied({ message: "permission denied for function create_payment" }),
    true,
  );
});

test("خطای واقعیِ دیگر «اجازه ندارم» نیست", () => {
  assert.equal(isPermissionDenied({ code: "23505", message: "duplicate key value" }), false);
  assert.equal(isPermissionDenied({ code: "42P01", message: "relation does not exist" }), false);
  assert.equal(isPermissionDenied({ message: "مبلغ نامعتبر." }), false);
});

test("نبودِ خطا با «اجازه ندارم» یکی نیست", () => {
  assert.equal(isPermissionDenied(null), false);
  assert.equal(isPermissionDenied(undefined), false);
  assert.equal(isPermissionDenied({}), false);
});
