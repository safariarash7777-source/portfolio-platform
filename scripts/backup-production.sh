#!/usr/bin/env bash
#
# بکاپِ دستیِ Production — مسیرِ رایگان، بدونِ ارتقای پلن.
#
#   bash scripts/backup-production.sh
#
# ── چرا این فایل وجود دارد ───────────────────────────────────────────────────
# سازمانِ Production روی پلنِ `free` است و Supabase برای این پلن بکاپِ خودکار
# نمی‌گیرد. تا وقتی نقطهٔ بازگشتی نداشته باشیم، هیچ migrationی روی Production
# اجرا نمی‌شود. این اسکریپت همان نقطهٔ بازگشت را می‌سازد و — مهم‌تر — **ثابت
# می‌کند که واقعاً قابلِ بازیابی است**.
#
# ── قواعدی که این اسکریپت رعایت می‌کند ───────────────────────────────────────
#   • رشتهٔ اتصال **هرگز** روی دیسک، در تاریخچهٔ شل، یا در خروجی نوشته نمی‌شود.
#   • فایل‌های بکاپ **بیرون از مخزن** ساخته می‌شوند و اسکریپت اگر ببیند مقصد
#     داخلِ یک ریپوی گیت است، اجرا نمی‌شود.
#   • بازگردانی در **یک تراکنش** و با `ON_ERROR_STOP=1` انجام می‌شود؛ معیارِ
#     موفقیت **کدِ خروجیِ psql** است، نه grep روی لاگ.
#   • مقصدِ بازگردانی یک استکِ **Supabaseِ محلیِ ایزوله** است، نه Postgresِ ساده.
#   • مقایسه با `scripts/backup/inventory.sql` + `compare.mjs` انجام می‌شود:
#     شمارشِ دقیقِ همهٔ جدول‌ها و اثرِ انگشتِ ساختاری، **دوطرفه**.
#
# ⚠️ تنها نشتِ باقی‌مانده: `supabase db dump` رشتهٔ اتصال را به‌صورتِ آرگومان
#    می‌گیرد، پس تا لحظهٔ اجرا در خروجیِ `ps` دیده می‌شود. روی لپ‌تاپِ شخصی
#    اهمیتِ عملی ندارد، ولی روی ماشینِ مشترک این اسکریپت را اجرا نکن.
#
# پیش‌نیاز: Docker (Supabase CLI کانتینر بالا می‌آورد) · Supabase CLI · Node.

set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${BACKUP_DIR:-$HOME/supabase-backups/prod-$STAMP}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INVENTORY_SQL="$REPO_ROOT/scripts/backup/inventory.sql"
COMPARE_JS="$REPO_ROOT/scripts/backup/compare.mjs"

# استکِ راستی‌آزمایی: نامِ یکتا و پورت‌های یکتا، تا هیچ پروژهٔ محلیِ موجودی
# لمس نشود. نامِ پوشه همان project id در Supabase CLI است.
VERIFY_ID="prodverify$STAMP"
VERIFY_WORKDIR="${TMPDIR:-/tmp}/$VERIFY_ID"
# پایهٔ پورت از STAMP مشتق می‌شود تا دو اجرای هم‌زمان هم برخورد نکنند.
PORT_BASE=$(( 55000 + (10#${STAMP: -4} % 900) * 10 ))

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n❌ %s\n' "$*" >&2; exit 1; }

# ── ۰) مقصد باید بیرونِ هر مخزنِ گیت باشد ────────────────────────────────────
# عمداً **اولین** بررسی است: ارزان‌ترین است و اگر مقصد غلط باشد، بهتر است کاربر
# قبل از هر کارِ دیگری بفهمد.
mkdir -p "$OUT_DIR"
if git -C "$OUT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  rmdir "$OUT_DIR" 2>/dev/null || true
  die "مقصد داخلِ یک مخزنِ گیت است: $OUT_DIR
فایلِ بکاپ هرگز نباید وارد مخزن شود. با BACKUP_DIR مسیرِ دیگری بده."
fi
chmod 700 "$OUT_DIR"

# ── ۱) پیش‌نیازها ────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "Docker نصب نیست. Supabase CLI بدونِ آن استک بالا نمی‌آورد."
docker info >/dev/null 2>&1 || die "Docker نصب هست ولی در حال اجرا نیست. Docker Desktop را باز کن."
command -v node >/dev/null 2>&1 || die "Node نصب نیست. مقایسهٔ ساختاری به آن نیاز دارد."
[ -f "$INVENTORY_SQL" ] || die "فایلِ $INVENTORY_SQL پیدا نشد."
[ -f "$COMPARE_JS" ] || die "فایلِ $COMPARE_JS پیدا نشد."

if command -v supabase >/dev/null 2>&1; then
  SUPA=(supabase)
elif command -v npx >/dev/null 2>&1; then
  SUPA=(npx --yes supabase)
else
  die "نه \`supabase\` پیدا شد و نه \`npx\`. یکی از این دو لازم است."
fi

# ── ۲) رشتهٔ اتصال — پرسیده می‌شود، ذخیره نمی‌شود ────────────────────────────
cat <<'EOS'

رشتهٔ اتصالِ Production را از داشبورد بردار:
  Supabase Dashboard → پروژه → دکمهٔ Connect → Session pooler یا Direct connection

هنگامِ تایپ چیزی نمایش داده نمی‌شود. این مقدار نه ذخیره می‌شود، نه چاپ،
و نه در تاریخچهٔ شل می‌ماند. **آن را در چت برای کسی نفرست.**

EOS
read -rsp "connection string: " DB_URL
echo
export DB_URL
[ -n "${DB_URL:-}" ] || die "چیزی وارد نشد."

# ── پاکسازی، روی هر مسیرِ خروج ───────────────────────────────────────────────
# شاملِ موفقیت، خطا، استارتِ ناقص و Ctrl-C. استکِ رهاشده هم پورت می‌گیرد و هم
# دادهٔ Production را روی دیسک نگه می‌دارد.
cleanup() {
  local rc=$?
  if [ -d "$VERIFY_WORKDIR" ]; then
    say "پاکسازیِ استکِ موقت"
    "${SUPA[@]}" stop --workdir "$VERIFY_WORKDIR" --no-backup --yes >/dev/null 2>&1 || true
    rm -rf "$VERIFY_WORKDIR"
  fi
  exit $rc
}
trap cleanup EXIT INT TERM

# ── ۳) اثرِ انگشتِ مبدأ، پیش از بکاپ ─────────────────────────────────────────
say "۱/۵ — خواندنِ اثرِ انگشتِ Production (فقط خواندن)"
# ⚠️ رشتهٔ اتصال **داخلِ کانتینر** بسط داده می‌شود، نه در شلِ میزبان — پس
# واردِ argv میزبان و خروجیِ `ps` نمی‌شود. فایلِ SQL هم mount می‌شود، نه
# pipe؛ pipe کردنِ متنِ فارسی به یک پروسهٔ native روی PowerShell 5.1 خراب
# می‌شود و این دو اسکریپت باید یک رفتار داشته باشند.
docker run --rm -e DB_URL -v "$REPO_ROOT/scripts/backup:/sql:ro" \
  --entrypoint sh postgres:17-alpine \
  -c 'psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f /sql/inventory.sql' \
  > "$OUT_DIR/inventory-source.txt" \
  || die "اتصال به Production برقرار نشد یا اثرِ انگشت خوانده نشد."
printf '    %s سطرِ فهرست ثبت شد\n' "$(wc -l < "$OUT_DIR/inventory-source.txt" | tr -d ' ')"

# ── ۴) سه فایلِ بکاپ، طبقِ روشِ رسمیِ Supabase ────────────────────────────────
say "۲/۵ — گرفتنِ بکاپ (roles · schema · data)"
"${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT_DIR/roles.sql"  --role-only
"${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT_DIR/schema.sql"
"${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT_DIR/data.sql"   --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

for f in roles schema data; do
  [ -s "$OUT_DIR/$f.sql" ] || die "$f.sql خالی است — بکاپ ناقص است."
done

# ── ۵) استکِ Supabaseِ محلیِ ایزوله ──────────────────────────────────────────
# ⚠️ Postgresِ سادهٔ `postgres:17-alpine` مقصدِ درستی **نیست**: dumpِ schema
# اسکیماهای مدیریت‌شده مثلِ `auth` و `storage` را ندارد، ولی dumpِ data
# دادهٔ همان‌ها (مثلِ `auth.users`) را دارد. روی Postgresِ ساده آن جدول‌ها
# وجود ندارند، پس یا بازگردانی می‌شکند یا شکستش پنهان می‌شود.
say "۳/۵ — بالا آوردنِ استکِ Supabaseِ محلیِ ایزوله ($VERIFY_ID)"
mkdir -p "$VERIFY_WORKDIR"
"${SUPA[@]}" init --workdir "$VERIFY_WORKDIR" --yes >/dev/null 2>&1 \
  || die "supabase init روی پوشهٔ موقت شکست خورد."

# پورت‌های یکتا تا پروژهٔ محلیِ خودِ آرش دست‌نخورده بماند.
CONFIG="$VERIFY_WORKDIR/supabase/config.toml"
[ -f "$CONFIG" ] || die "config.toml ساخته نشد."
python3 - "$CONFIG" "$PORT_BASE" <<'PY'
import re, sys
path, base = sys.argv[1], int(sys.argv[2])
text = open(path, encoding='utf-8').read()
seen = {}
def bump(match):
    original = int(match.group(1))
    if original not in seen:
        seen[original] = base + len(seen)
    return 'port = %d' % seen[original]
open(path, 'w', encoding='utf-8').write(re.sub(r'port = (\d+)', bump, text))
PY

"${SUPA[@]}" start --workdir "$VERIFY_WORKDIR" >/dev/null \
  || die "استکِ Supabaseِ محلی بالا نیامد."

VERIFY_URL="$("${SUPA[@]}" status --workdir "$VERIFY_WORKDIR" -o env 2>/dev/null \
  | sed -n 's/^DB_URL="\(.*\)"$/\1/p')"
[ -n "$VERIFY_URL" ] || die "آدرسِ دیتابیسِ استکِ محلی خوانده نشد."

# اسکیماهای مدیریت‌شده باید **پیش از** بازگردانی موجود باشند، وگرنه مقصد
# فاقدِ چیزی است که dumpِ data به آن نیاز دارد.
docker run --rm --network host -e DB_URL="$VERIFY_URL" \
  -v "$REPO_ROOT/scripts/backup:/sql:ro" \
  --entrypoint sh postgres:17-alpine \
  -c 'psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f /sql/assert-managed-schemas.sql' \
  || die "مقصدِ بازگردانی اسکیماهای مدیریت‌شده را ندارد.
یعنی مقصد وفادار نیست و آزمونِ بازگردانی چیزی را اثبات نمی‌کند."

# ── ۶) بازگردانیِ اتمیک ──────────────────────────────────────────────────────
# یک فراخوانیِ psql، یک تراکنش، `ON_ERROR_STOP=1`، ترتیبِ رسمی:
# roles → schema → `session_replication_role=replica` → data.
#
# ⚠️ معیارِ موفقیت **کدِ خروجی** است. نسخهٔ قبل `|| true` می‌گذاشت و بعد در
# لاگ دنبالِ `^ERROR` می‌گشت — ولی خطاهای فایل‌محورِ psql با
# `psql:/tmp/schema.sql:123: ERROR:` شروع می‌شوند، نه با `ERROR`. یعنی
# نشانگری که هرگز نمی‌توانست قرمز شود.
say "۴/۵ — بازگردانی در یک تراکنش (ON_ERROR_STOP=1)"
set +e
docker run --rm --network host -e DB_URL="$VERIFY_URL" \
  -v "$OUT_DIR:/backup:ro" --entrypoint sh postgres:17-alpine \
  -c 'psql --single-transaction --variable ON_ERROR_STOP=1 \
       --file /backup/roles.sql \
       --file /backup/schema.sql \
       --command "SET session_replication_role = replica" \
       --file /backup/data.sql \
       --dbname "$DB_URL"' > "$OUT_DIR/restore.log" 2>&1
RESTORE_RC=$?
set -e
if [ "$RESTORE_RC" -ne 0 ]; then
  printf '    آخرین خطوطِ لاگ:\n'
  tail -20 "$OUT_DIR/restore.log" | sed 's/^/      /'
  die "بازگردانی با کدِ $RESTORE_RC شکست خورد. کلِ تراکنش برگشت.
لاگ: $OUT_DIR/restore.log
بکاپ **قابلِ اتکا نیست**. هیچ migrationی روی Production اجرا نمی‌شود."
fi
echo "    بازگردانی با کدِ ۰ تمام شد."

# ── ۷) مقایسهٔ دوطرفه ────────────────────────────────────────────────────────
say "۵/۵ — مقایسهٔ شمارشِ ردیف‌ها و اثرِ انگشتِ ساختاری"
docker run --rm --network host -e DB_URL="$VERIFY_URL" \
  -v "$REPO_ROOT/scripts/backup:/sql:ro" \
  --entrypoint sh postgres:17-alpine \
  -c 'psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f /sql/inventory.sql' \
  > "$OUT_DIR/inventory-restored.txt" \
  || die "اثرِ انگشتِ مقصد خوانده نشد."

set +e
node "$COMPARE_JS" "$OUT_DIR/inventory-source.txt" "$OUT_DIR/inventory-restored.txt" \
  --report "$OUT_DIR/comparison.txt"
COMPARE_RC=$?
set -e

# ── ۸) manifest — فقط غیرحساس ────────────────────────────────────────────────
VERDICT=$([ "$COMPARE_RC" -eq 0 ] && echo PASS || echo FAIL)
{
  echo "backup taken:   $(date -u '+%Y-%m-%dT%H:%M:%SZ') UTC"
  echo "project ref:    uooeygybrniptzdxuzhj (production)"
  echo "supabase cli:   $("${SUPA[@]}" --version 2>/dev/null | tail -1)"
  echo "verify target:  isolated local Supabase stack ($VERIFY_ID)"
  echo "restore method: single psql invocation, --single-transaction, ON_ERROR_STOP=1"
  echo "restore exit:   $RESTORE_RC"
  echo "verification:   dynamic row counts (public+auth+storage) + structural fingerprint, both directions"
  echo "exclusions:     storage.buckets_vectors, storage.vector_indexes (documented)"
  echo "inventory rows: $(wc -l < "$OUT_DIR/inventory-source.txt" | tr -d ' ')"
  echo "result:         $VERDICT"
  echo
  for f in roles schema data; do
    p="$OUT_DIR/$f.sql"
    printf '%-10s %12s bytes  sha256=%s\n' "$f.sql" \
      "$(wc -c <"$p" | tr -d ' ')" "$(sha256sum "$p" | cut -d' ' -f1)"
  done
} > "$OUT_DIR/MANIFEST.txt"
cat "$OUT_DIR/MANIFEST.txt"

echo
if [ "$COMPARE_RC" -eq 0 ]; then
  cat <<EOS
✅ بکاپ ساخته شد و **آزمونِ بازگردانی را پاس کرد**.

مسیر: $OUT_DIR

قدمِ بعد — فقط MANIFEST.txt را برای Claude بفرست. هیچ‌کدام از خطوطش حساس
نیست: نه رشتهٔ اتصال دارد، نه رمز، نه دادهٔ کاربر.

⚠️ این پوشه را جای امنی نگه دار. دادهٔ واقعیِ کاربران داخلش است.
   واردِ مخزن، GitHub، تلگرام یا ایمیل نکن.
EOS
else
  die "بکاپ ساخته شد ولی مقایسه نخواند. جزئیات: $OUT_DIR/comparison.txt
این یعنی بکاپ قابلِ اتکا **نیست**.
تا رفعِ این مشکل هیچ migrationی روی Production اجرا نمی‌شود."
fi
