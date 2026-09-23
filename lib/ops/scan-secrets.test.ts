import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * قاعدهٔ `db-url` در `scripts/scan-secrets.mjs` — جعبه‌سیاه، در یک مخزنِ گیتِ موقت.
 *
 * این آزمون وقتی لازم شد که یک رمزِ ساخته‌شده در زمانِ اجرا
 * (`postgresql://user:${encodeURIComponent(pw)}@host`) مثبتِ کاذب داد. استثنا
 * باید تنگ باشد: رمزِ ثابت، حتی کنارِ interpolation، همچنان باید گرفته شود.
 * رشته‌ها تکه‌تکه ساخته می‌شوند تا خودِ این فایل یافته نشود.
 */
const SCANNER = join(process.cwd(), "scripts", "scan-secrets.mjs");
const P = "postgresql" + "://";

function scan(line: string): number {
  const dir = mkdtempSync(join(tmpdir(), "scan-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, "f.ts"), `${line}\n`);
  execFileSync("git", ["add", "f.ts"], { cwd: dir });
  return spawnSync("node", [SCANNER], { cwd: dir, encoding: "utf8" }).status ?? -1;
}

test("رمزِ ثابت گرفته می‌شود", () => {
  assert.equal(scan(`const u = "${P}bob:Zq8wLm2vKs@db.host:5432/app";`), 1);
});

test("رمزِ ثابت کنارِ userِ interpolation‌شده هم گرفته می‌شود", () => {
  assert.equal(scan("const u = `" + P + "${user}:Zq8wLm2vKs@db.host/app`;"), 1);
});

test("رمزِ ثابتی که با interpolation ادامه پیدا می‌کند هم گرفته می‌شود", () => {
  assert.equal(scan("const u = `" + P + "bob:${x}Zq8wLm2vKs@db.host/app`;"), 1);
});

test("رمزی که کلاً یک interpolation است مثبتِ کاذب نیست", () => {
  assert.equal(scan("const u = `" + P + "${ROLE}:${encodeURIComponent(pw)}@${host}/db`;"), 0);
});
