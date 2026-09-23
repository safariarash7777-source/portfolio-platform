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
#   • مقصدِ بازگردانی یک استکِ Supabaseِ یک‌بارمصرف (db + auth + storage) از
#     `scripts/backup/verify-stack.compose.yml` است، نه Postgresِ ساده. **هیچ
#     پورتی منتشر نمی‌کند** و روی شبکهٔ `internal` است: نه از شبکهٔ محلی دیده
#     می‌شود، نه چیزی که در آن بازگردانی شده (jobهای pg_cron، درخواست‌های pg_net)
#     به سرویسِ واقعی می‌رسد. هر دو پیش از ورودِ داده روی کانتینرهای **در حالِ
#     اجرا** خوانده می‌شوند.
#   • پیش از بازگردانی، **ساختارِ** auth/storageِ مقصد باید با Production یکی
#     باشد (`scripts/backup/managed-schemas.sql`) — عددِ نسخهٔ تازه‌تر کافی نیست.
#   • مقایسه با `scripts/backup/inventory.sql` + `compare.mjs` انجام می‌شود:
#     شمارشِ دقیقِ همهٔ جدول‌ها و اثرِ انگشتِ ساختاری، **دوطرفه**.
#   • اگر dump موفق بود ولی بازگردانی یا مقایسه نه، فایل‌های بکاپ **نگه داشته
#     می‌شوند** و MANIFEST.txt می‌نویسد RESTORE UNVERIFIED.
#
# ⚠️ تنها نشتِ باقی‌مانده: `supabase db dump` رشتهٔ اتصال را به‌صورتِ آرگومان
#    می‌گیرد، پس تا لحظهٔ اجرا در خروجیِ `ps` دیده می‌شود. روی لپ‌تاپِ شخصی
#    اهمیتِ عملی ندارد، ولی روی ماشینِ مشترک این اسکریپت را اجرا نکن.
#
# پیش‌نیاز: Docker (با `docker compose`) · Node · Supabase CLI (فقط برای dump).
#
# فقط برای آزمون: BACKUP_KEEP_VERIFY_STACK=1 استکِ موقت را پس از اجرا نگه می‌دارد
# تا آزمون بتواند داخلش را ببیند. برای بکاپِ Production هرگز: دادهٔ واقعیِ اعضا روی
# دیسک می‌ماند.

set -euo pipefail

PG_IMAGE="postgres:17-alpine"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${BACKUP_DIR:-$HOME/supabase-backups/prod-$STAMP}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_DIR="$REPO_ROOT/scripts/backup"
INVENTORY_SQL="$SQL_DIR/inventory.sql"
MANAGED_SQL="$SQL_DIR/managed-schemas.sql"
COMPARE_JS="$SQL_DIR/compare.mjs"
COMPOSE_FILE="$SQL_DIR/verify-stack.compose.yml"

# یک نام برای همهٔ منابعِ این اجرا: پروژهٔ compose، نامِ کانتینرها، شبکه، volumeها
# و برچسبِ com.portfolio.backup-verify — پاکسازی دقیقاً همین اجرا را برمی‌دارد.
VERIFY_ID="prodverify${STAMP//-/}"
VERIFY_LABEL="com.portfolio.backup-verify=$VERIFY_ID"
VERIFY_NET="${VERIFY_ID}_verify"
KEEP_STACK="${BACKUP_KEEP_VERIFY_STACK:-0}"

FAIL_REASON=""
DUMP_DONE=0
MANIFEST_WRITTEN=0
STACK_STARTED=0
RESTORE_RC=-1
COMPARE_RC=-1
MANAGED_RC=-1
SRC_AUTH="(not read)"
SRC_CRON="(not read)"
DST_AUTH="(not read)"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { FAIL_REASON="$1"; printf '\n❌ %s\n' "$*" >&2; exit 1; }

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
command -v docker >/dev/null 2>&1 || die "Docker نصب نیست. هم dump و هم آزمونِ بازگردانی به آن نیاز دارند."
docker info >/dev/null 2>&1 || die "Docker نصب هست ولی در حال اجرا نیست. Docker Desktop را باز کن."
docker compose version >/dev/null 2>&1 || die "\`docker compose\` در دسترس نیست. Docker را به‌روز کن."
command -v node >/dev/null 2>&1 || die "Node نصب نیست. مقایسهٔ ساختاری به آن نیاز دارد."
for f in "$INVENTORY_SQL" "$MANAGED_SQL" "$COMPARE_JS" "$COMPOSE_FILE" \
         "$SQL_DIR/assert-managed-schemas.sql" "$SQL_DIR/verify-stack-shape.sql" "$SQL_DIR/restore-prelude.sql" "$SQL_DIR/pgurl.sh"; do
  [ -f "$f" ] || die "فایلِ $f پیدا نشد."
done
# pgurl.sh داخلِ کانتینرِ لینوکسی با busybox sh منبع می‌شود؛ CRLF آن را خط‌به‌خط
# می‌شکند (روی لپ‌تاپِ آرش با core.autocrlf=true دقیقاً همین شد).
if LC_ALL=C grep -q $'\r' "$SQL_DIR/pgurl.sh"; then
  die "scripts/backup/pgurl.sh پایانِ خطِ ویندوزی (CRLF) دارد. دوباره checkout کن:
    rm scripts/backup/pgurl.sh && git checkout -- scripts/backup/pgurl.sh"
fi

# مسیرِ npx **pin** شده است: روی لپ‌تاپِ آرش `npx --yes supabase`ِ بی‌نسخه به یک
# نصبِ کش‌شدهٔ 2.117.0 رسید که باینریِ پلتفرمش (وابستگیِ optionalِ npm) بی‌صدا
# دانلود نشده بود و dump پس از واردکردنِ رمز شکست خورد. نسخهٔ pin‌شده کشِ خودش
# را دارد و CLI یک بار **پیش از** پرسیدنِ رمز اجرا می‌شود.
SUPA_PIN="supabase@2.117.0"
if command -v supabase >/dev/null 2>&1; then
  SUPA=(supabase)
elif command -v npx >/dev/null 2>&1; then
  SUPA=(npx --yes "$SUPA_PIN")
else
  die "نه \`supabase\` پیدا شد و نه \`npx\`. یکی از این دو لازم است."
fi
SUPA_VERSION="$("${SUPA[@]}" --version 2>/dev/null | tail -1)" || true
printf '%s' "$SUPA_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' \
  || die "Supabase CLI روی این ماشین اجرا نمی‌شود (${SUPA[*]} --version). هنوز چیزی پرسیده یا نوشته نشده."
echo "Supabase CLI برای dump: $SUPA_VERSION"

compose() { docker compose -p "$VERIFY_ID" -f "$COMPOSE_FILE" "$@"; }
hex_secret() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }

# ── ۲) رشتهٔ اتصال — پرسیده می‌شود، ذخیره نمی‌شود ────────────────────────────
cat <<'EOS'

رشتهٔ اتصالِ Production را از داشبورد بردار:
  Supabase Dashboard → پروژه → دکمهٔ Connect → Session pooler یا Direct connection

هنگامِ تایپ چیزی نمایش داده نمی‌شود. این مقدار نه ذخیره می‌شود، نه چاپ،
و نه در تاریخچهٔ شل می‌ماند. **آن را در چت برای کسی نفرست.**

EOS
read -rsp "connection string: " DB_URL
echo
[ -n "${DB_URL:-}" ] || die "چیزی وارد نشد."
DB_URL="$(printf '%s' "$DB_URL" | tr -d '[:space:]')"
case "$DB_URL" in
  postgres://*|postgresql://*) : ;;
  *) die "این رشتهٔ اتصال به نظر نمی‌آید. باید با postgresql:// یا postgres:// شروع شود." ;;
esac

# ── رشتهٔ اتصال از stdin به کانتینر می‌رود ──────────────────────────────────
#
# نسخهٔ قبل از پاس‌ترویِ `docker run -e DB_URL` استفاده می‌کرد. روی دستگاهِ آرش
# مقدار **نرسید**: psql رشتهٔ تهی دید و بی‌صدا سراغِ سوکتِ محلی رفت، و خطایی
# داد که هیچ شباهتی به علتِ واقعی نداشت.
#
# stdin این سؤال را حذف می‌کند و مقدار را از argvِ `docker run` و از
# `docker inspect` بیرون نگه می‌دارد. هر کاری که داخلِ کانتینر با مقدار می‌شود
# در **یک** فایل است — `scripts/backup/pgurl.sh`، مشترک با نسخهٔ PowerShell —
# تا دو اصلاحِ موازی از هم دور نشوند (B-057): حذفِ CR، توقفِ exit 64 روی ورودیِ
# خالی یا غیر URI پیش از psql، و انتقالِ رمز از argvِ psql به PGPASSWORD.
psql_with_url() {
  local psql_args="$1"; shift
  printf '%s\n' "$DB_URL" | docker run --rm -i -v "$SQL_DIR:/sql:ro" "$@" \
    --entrypoint sh "$PG_IMAGE" \
    -c ". /sql/pgurl.sh; pgurl_psql $psql_args"
}

# ── manifest — فقط غیرحساس ────────────────────────────────────────────────────
# هم در موفقیت و هم در هر شکستِ پس از dump نوشته می‌شود: فایل‌ها می‌مانند و
# manifest باید صریح بگوید بازگردانی‌شان اثبات شد یا نه.
write_manifest() {
  local verdict="$1"
  {
    echo "backup taken:   $(date -u '+%Y-%m-%dT%H:%M:%SZ') UTC"
    echo "project ref:    uooeygybrniptzdxuzhj (production)"
    echo "supabase cli:   $SUPA_VERSION (dump only)"
    echo "verify target:  scripts/backup/verify-stack.compose.yml, project $VERIFY_ID (images pinned by digest)"
    echo "isolation:      no published port, internal network, checked on the running containers before restore"
    echo "restore method: docker exec in the db container, supabase_admin, one psql invocation, --single-transaction, ON_ERROR_STOP=1"
    echo "restore exit:   $RESTORE_RC"
    echo "auth schema:    production $SRC_AUTH / verify stack $DST_AUTH"
    echo "managed schema: auth+storage structure compare exit $MANAGED_RC (0 = identical)"
    echo "verification:   structural fingerprint (both directions) + dynamic row counts (public+auth+storage) + auth.users credential digest"
    echo "live window:    source fingerprint read twice (before and after the dump). A table that moved"
    echo "                between them is reported as UNVERIFIED, not accepted. The window is evidence"
    echo "                of drift, not proof of correctness."
    echo "snapshot match: NOT PERFORMED - the inventory is not read in the dump's own snapshot."
    echo "                pg_dump supports --snapshot; whether 'supabase db dump' passes it through"
    echo "                is UNVERIFIED. Until then, row counts for live tables stay unproven."
    echo "scope limit:    a row count does not see content. A changed column value, or an insert and a"
    echo "                delete in the same window, leave the count untouched. sha256 below proves the"
    echo "                integrity of each file only - not the completeness of the source data."
    echo "exclusions:     storage.buckets_vectors, storage.vector_indexes (documented)"
    echo "NOT IN BACKUP:  pg_cron jobs - production has $SRC_CRON; supabase db dump leaves cron.job out. Recreate them by hand after a restore."
    echo "inventory rows: $(wc -l < "$OUT_DIR/inventory-source.txt" 2>/dev/null | tr -d ' ')"
    echo "result:         $verdict"
    echo
    for f in roles schema data; do
      p="$OUT_DIR/$f.sql"
      if [ -f "$p" ]; then
        printf '%-10s %12s bytes  sha256=%s\n' "$f.sql" \
          "$(wc -c <"$p" | tr -d ' ')" "$(sha256sum "$p" | cut -d' ' -f1)"
      else
        printf '%-10s missing\n' "$f.sql"
      fi
    done
  } > "$OUT_DIR/MANIFEST.txt"
  MANIFEST_WRITTEN=1
  cat "$OUT_DIR/MANIFEST.txt"
}

# ── پاکسازی، روی هر مسیرِ خروج ───────────────────────────────────────────────
# شاملِ موفقیت، خطا، استارتِ ناقص و Ctrl-C. استکِ رهاشده دادهٔ Production را روی
# دیسک نگه می‌دارد.
cleanup() {
  local rc=$?
  set +e
  if [ "$DUMP_DONE" = 1 ] && [ "$MANIFEST_WRITTEN" = 0 ]; then
    printf '\n⚠️ RESTORE UNVERIFIED — فایل‌های بکاپ ساخته شدند و **نگه داشته شدند**، ولی\n'
    printf '   قابلِ بازگردانی بودنشان اثبات نشد. پاکشان نکن.\n'
    write_manifest "RESTORE UNVERIFIED - $(printf '%s' "$FAIL_REASON" | head -1)"
    echo "مسیر: $OUT_DIR"
  fi
  if [ "$STACK_STARTED" = 1 ]; then
    if [ "$KEEP_STACK" = 1 ]; then
      printf '\n[TEST] BACKUP_KEEP_VERIFY_STACK=1: استکِ %s روشن ماند.\n' "$VERIFY_ID"
    else
      say "پاکسازیِ استکِ موقت ($VERIFY_ID)"
      compose down --volumes --remove-orphans --timeout 5 >/dev/null 2>&1
      local left
      left="$( { docker ps -a -q --filter "label=$VERIFY_LABEL"
                 docker volume ls -q --filter "label=com.docker.compose.project=$VERIFY_ID"
                 docker network ls -q --filter "label=$VERIFY_LABEL"; } 2>/dev/null | grep -c . )"
      if [ "$left" -gt 0 ]; then
        echo "⚠️ $left منبع از $VERIFY_ID مانده است. با این پاکش کن:"
        echo "    docker compose -p $VERIFY_ID -f $COMPOSE_FILE down --volumes"
      else
        echo "    پاک شد: کانتینرها، شبکه و volumeهای $VERIFY_ID (چیزِ دیگری لمس نشد)"
      fi
    fi
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
# اول یک بررسیِ ارزان و صریح، پیش از هر کارِ سنگین.
PROBE="$(psql_with_url '-X -q -t -A -c "SELECT 1"' 2>/dev/null | tr -d '[:space:]')" || true
[ "$PROBE" = "1" ] || die "با این رشتهٔ اتصال نمی‌شود به Production وصل شد.
در Supabase Dashboard → Connect دوباره بررسی‌اش کن. هیچ چیزی نوشته نشد."
echo "    اتصال برقرار است."

# نسخهٔ طرحِ Authِ Production: مقصدِ بازگردانی باید دست‌کم همین‌قدر تازه باشد
# (۲۰۲۶۰۸۳۱۱۸۰۰۰۰ ستونِ auth.one_time_tokens.expires_at را افزود؛ Authِ قدیمی‌تر آن را
# ندارد و dumpِ داده بار نمی‌شود). کنارِ بکاپ ثبت می‌شود تا بازگردانیِ بعدی هم بسنجد.
SRC_AUTH="$(psql_with_url "-X -q -t -A -c 'SELECT max(version) FROM auth.schema_migrations'" 2>/dev/null | tr -d '[:space:]')" || true
printf '%s' "$SRC_AUTH" | grep -Eq '^[0-9]{14}$' || die "نسخهٔ طرحِ Authِ Production خوانده نشد."
printf '%s\n' "$SRC_AUTH" > "$OUT_DIR/auth-version.txt"
echo "    طرحِ Authِ Production: $SRC_AUTH"

# jobهای pg_cron در خروجیِ `supabase db dump` **نیستند** (CLI 2.117.0: dumpِ داده هیچ
# ردیفی از cron.job ندارد؛ با یک jobِ مصنوعی اندازه‌گیری شد). اینجا شمرده می‌شوند
# تا manifest این شکاف را بگوید، نه پنهانش کند.
SRC_CRON="$(psql_with_url "-X -q -t -A -c 'SELECT coalesce((xpath(\$\$/row/c/text()\$\$, query_to_xml(\$\$SELECT count(*) AS c FROM cron.job\$\$, false, true, \$\$\$\$)))[1]::text, \$\$0\$\$) WHERE to_regclass(\$\$cron.job\$\$) IS NOT NULL'" 2>/dev/null | tr -d '[:space:]')" \
  || die "وصل شدیم ولی jobهای pg_cronِ Production شمرده نشد."
[ -n "$SRC_CRON" ] || SRC_CRON="0 (pg_cron not installed)"
echo "    jobهای pg_cronِ Production: $SRC_CRON (جزوِ dump نیستند — MANIFEST را ببین)"

psql_with_url '-X -q -v ON_ERROR_STOP=1 -f /sql/inventory.sql' \
  > "$OUT_DIR/inventory-source.txt" \
  || die "وصل شدیم ولی اثرِ انگشتِ Production خوانده نشد."
printf '    %s سطرِ فهرست ثبت شد\n' "$(wc -l < "$OUT_DIR/inventory-source.txt" | tr -d ' ')"

# ساختارِ auth/storage که مقصدِ بازگردانی باید عیناً داشته باشد.
psql_with_url '-X -q -v ON_ERROR_STOP=1 -f /sql/managed-schemas.sql' \
  > "$OUT_DIR/managed-source.txt" \
  || die "وصل شدیم ولی ساختارِ auth/storageِ Production خوانده نشد."

# ── ۴) سه فایلِ بکاپ، طبقِ روشِ رسمیِ Supabase ────────────────────────────────
say "۲/۵ — گرفتنِ بکاپ (roles · schema · data)"
"${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT_DIR/roles.sql"  --role-only || die "dumpِ roles شکست خورد."
"${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT_DIR/schema.sql" || die "dumpِ schema شکست خورد."
"${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT_DIR/data.sql"   --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes" || die "dumpِ data شکست خورد."
DUMP_DONE=1

# ── ۴′) اثرِ انگشتِ مبدأ، **پس از** dump ──────────────────────────────────────
# Production حینِ همین چند دقیقه نوشته است: رله هر ۵ دقیقه اسنپ‌شات می‌گذارد و
# `symbol_history` روزانه بیش از هزار ردیف می‌گیرد. بدونِ این خواندنِ دوم،
# مقایسه یک بکاپِ کاملاً سالم را مردود می‌کند و اپراتور یاد می‌گیرد مقایسه را
# جدی نگیرد — که از نبودش بدتر است.
#
# این «چشم‌پوشی» نیست، **اندازه‌گیری** است: هر جدولی که بینِ دو خواندن تکان
# خورده، ثابت شده در همان پنجره زنده بوده. شمارشِ بیرونِ آن بازه — به‌ویژه
# **کمتر** از کمینه‌اش — همچنان شکست است.
psql_with_url '-X -q -v ON_ERROR_STOP=1 -f /sql/inventory.sql' \
  > "$OUT_DIR/inventory-source-after.txt" \
  || die "اثرِ انگشتِ دومِ Production خوانده نشد."

for f in roles schema data; do
  [ -s "$OUT_DIR/$f.sql" ] || die "$f.sql خالی است — بکاپ ناقص است."
done

# ── ۵) مقصدِ یک‌بارمصرفِ بازگردانی ────────────────────────────────────────────
# ⚠️ Postgresِ سادهٔ `postgres:17-alpine` مقصدِ درستی **نیست**: dumpِ schema
# اسکیماهای مدیریت‌شده مثلِ `auth` و `storage` را ندارد، ولی dumpِ data
# دادهٔ همان‌ها (مثلِ `auth.users`) را دارد. روی Postgresِ ساده آن جدول‌ها
# وجود ندارند، پس یا بازگردانی می‌شکند یا شکستش پنهان می‌شود.
#
# `supabase start` دیگر به کار نمی‌رود: همهٔ پورت‌ها را روی 0.0.0.0/[::] منتشر
# می‌کند و هر Authی که CLIِ نصب‌شده همراه دارد را می‌آورد. اندازه‌گیری‌ها در
# سرآغازِ verify-stack.compose.yml.
say "۳/۵ — بالا آوردنِ مقصدِ ایزولهٔ بازگردانی ($VERIFY_ID)"
export VERIFY_ID
VERIFY_DB_PASSWORD="$(hex_secret 24)"; export VERIFY_DB_PASSWORD
VERIFY_JWT_SECRET="$(hex_secret 32)";  export VERIFY_JWT_SECRET
export VERIFY_ANON_KEY="unused-in-restore-test" VERIFY_SERVICE_KEY="unused-in-restore-test"
STACK_STARTED=1
compose up --detach --wait --quiet-pull \
  || die "مقصدِ بازگردانی سالم بالا نیامد (docker compose up --wait شکست خورد)."

# ── ۵′) ایزوله‌بودن، خوانده از کانتینرهای در حالِ اجرا ─────────────────────────
# نه «فایل ports ندارد» — آنچه Docker واقعاً ساخت. سه واقعیتِ جدا، هر کدام کافی
# برای توقف: هیچ پورتِ منتشرشده در `docker ps`؛ هیچ port binding یا publish-all در
# HostConfig و هیچ شبکه‌ای جز شبکهٔ خودِ این اجرا؛ و `internal` بودنِ آن شبکه.
PORTS="$(docker ps -a --filter "label=$VERIFY_LABEL" --format '{{.Names}}|{{.Ports}}')" \
  || die "فهرستِ کانتینرهای مقصد خوانده نشد."
[ "$(printf '%s\n' "$PORTS" | grep -c .)" = 3 ] || die "برای $VERIFY_ID سه کانتینر انتظار می‌رفت."
PUBLIC="$(printf '%s\n' "$PORTS" | grep -E '(^|[|, ])(0\.0\.0\.0|\[::\]|::):[0-9]+->' || true)"
[ -z "$PUBLIC" ] || die "مقصد پورت‌ها را روی همهٔ رابط‌ها منتشر کرده:
$PUBLIC
هیچ دادهٔ Production واردش نشد."
PUBLISHED="$(printf '%s\n' "$PORTS" | grep -e '->' || true)"
[ -z "$PUBLISHED" ] || die "مقصد پورت منتشر کرده:
$PUBLISHED
هیچ دادهٔ Production واردش نشد."
while IFS='|' read -r name _; do
  hc="$(docker inspect --format '{{json .HostConfig.PortBindings}}|{{.HostConfig.PublishAllPorts}}|{{range $k, $v := .NetworkSettings.Networks}}{{$k}};{{end}}' "$name")" \
    || die "بررسیِ $name ممکن نشد."
  IFS='|' read -r pb pa nets <<< "$hc"
  { [ "$pb" = "{}" ] || [ "$pb" = "null" ]; } && [ "$pa" = "false" ] && [ "$nets" = "$VERIFY_NET;" ] \
    || die "کانتینرِ $name ایزوله نیست ($hc). هیچ دادهٔ Production واردش نشد."
done <<< "$PORTS"
[ "$(docker network inspect --format '{{.Internal}}' "$VERIFY_NET")" = "true" ] \
  || die "شبکهٔ $VERIFY_NET internal نیست. هیچ دادهٔ Production واردش نشد."
DB_CONTAINER="$(docker ps -a --filter "label=$VERIFY_LABEL" --filter 'label=com.docker.compose.service=db' --format '{{.Names}}')"
[ -n "$DB_CONTAINER" ] || die "کانتینرِ دیتابیسِ $VERIFY_ID پیدا نشد."
echo "    هیچ‌کدام از ۳ کانتینر پورت منتشر نکرده؛ شبکهٔ $VERIFY_NET internal است"

# بقیه **داخلِ کانتینرِ دیتابیس** با `docker exec` اجرا می‌شود: بی‌نیاز به
# --network host و پورتِ منتشرشده، و psql همان نسخهٔ سرور است. تصویر
# supabase_admin را روی 127.0.0.1ِ داخلِ کانتینر trust می‌کند، پس رمزی لازم نیست.
# اتصال با supabase_admin: roles.sql پارامترهایی مثلِ log_min_messages را روی
# نقش‌ها می‌گذارد که فقط superuser مجاز است (با `postgres` شکست — یافتهٔ Codex).
in_db() {
  docker exec "$DB_CONTAINER" sh -c "psql -h 127.0.0.1 -U supabase_admin -d postgres -X -q $1"
}
docker exec "$DB_CONTAINER" mkdir -p /tmp/restore || die "آماده‌سازیِ کانتینرِ دیتابیس شکست خورد."
for f in "$OUT_DIR/roles.sql" "$OUT_DIR/schema.sql" "$OUT_DIR/data.sql" \
         "$SQL_DIR/assert-managed-schemas.sql" "$INVENTORY_SQL" "$MANAGED_SQL" "$SQL_DIR/verify-stack-shape.sql" "$SQL_DIR/restore-prelude.sql"; do
  docker cp "$f" "$DB_CONTAINER:/tmp/restore/" || die "کپیِ $(basename "$f") به کانتینر شکست خورد."
done

DST_AUTH="$(in_db "-t -A -c 'SELECT max(version) FROM auth.schema_migrations'" | tr -d '[:space:]')" || true
printf '%s' "$DST_AUTH" | grep -Eq '^[0-9]{14}$' || die "نسخهٔ طرحِ Authِ استکِ محلی خوانده نشد."
if [[ "$DST_AUTH" < "$SRC_AUTH" ]]; then
  die "طرحِ Authِ استکِ محلی ($DST_AUTH) از Production ($SRC_AUTH) قدیمی‌تر است.
بازگردانی روی ستون‌های تازه‌ترِ auth شکست می‌خورد. هیچ داده‌ای بازگردانی نشد.
تصویرِ auth را در scripts/backup/verify-stack.compose.yml به‌روز کن و دوباره اجرا کن."
fi
echo "    طرحِ Authِ محلی $DST_AUTH ≥ Production $SRC_AUTH"

# اسکیماهای مدیریت‌شده باید **پیش از** بازگردانی موجود باشند، وگرنه مقصد
# فاقدِ چیزی است که dumpِ data به آن نیاز دارد.
in_db "-v ON_ERROR_STOP=1 -f /tmp/restore/assert-managed-schemas.sql" \
  || die "مقصدِ بازگردانی اسکیماهای مدیریت‌شده را ندارد.
یعنی مقصد وفادار نیست و آزمونِ بازگردانی چیزی را اثبات نمی‌کند."

# …و **ساختارشان** باید همان Production باشد، دوطرفه. عددِ نسخه ساختار نیست.
# اول دو جدولِ خالی که فقط Storageِ تک‌مستأجر می‌سازد برداشته می‌شوند
# (verify-stack-shape.sql توضیح می‌دهد؛ اگر ردیفی داشته باشند امتناع می‌کند).
in_db "-v ON_ERROR_STOP=1 -f /tmp/restore/verify-stack-shape.sql" \
  || die "هم‌شکل‌کردنِ storageِ مقصد با پلتفرمِ میزبان شکست خورد."
in_db "-v ON_ERROR_STOP=1 -f /tmp/restore/managed-schemas.sql -o /tmp/restore/managed-target.txt" \
  || die "ساختارِ auth/storageِ مقصد خوانده نشد."
docker cp "$DB_CONTAINER:/tmp/restore/managed-target.txt" "$OUT_DIR/managed-target.txt" \
  || die "ساختارِ auth/storageِ مقصد از کانتینر بیرون نیامد."
set +e
node "$COMPARE_JS" "$OUT_DIR/managed-source.txt" "$OUT_DIR/managed-target.txt" \
  --report "$OUT_DIR/managed-comparison.txt" >/dev/null
MANAGED_RC=$?
set -e
[ "$MANAGED_RC" -eq 0 ] || die "ساختارِ auth/storageِ مقصد با Production فرق دارد (کدِ $MANAGED_RC).
جزئیات: $OUT_DIR/managed-comparison.txt
هیچ داده‌ای بازگردانی نشد. تصویرها را در verify-stack.compose.yml به‌روز کن."
echo "    ساختارِ auth/storage عیناً همان Production است (دوطرفه)"

# ── ۶) بازگردانیِ اتمیک ──────────────────────────────────────────────────────
# یک فراخوانیِ psql، یک تراکنش، `ON_ERROR_STOP=1`، ترتیبِ رسمی:
# roles → schema → `session_replication_role=replica` → data.
#
# ⚠️ معیارِ موفقیت **کدِ خروجی** است. نسخهٔ قبل `|| true` می‌گذاشت و بعد در
# لاگ دنبالِ `^ERROR` می‌گشت — ولی خطاهای فایل‌محورِ psql با
# `psql:/tmp/schema.sql:123: ERROR:` شروع می‌شوند، نه با `ERROR`. یعنی
# نشانگری که هرگز نمی‌توانست قرمز شود.
say "۴/۵ — بازگردانی در یک تراکنش (ON_ERROR_STOP=1، با supabase_admin)"
set +e
in_db "--single-transaction --variable ON_ERROR_STOP=1 --file /tmp/restore/roles.sql --file /tmp/restore/restore-prelude.sql --file /tmp/restore/schema.sql \
  --command 'SET session_replication_role = replica' --file /tmp/restore/data.sql > /tmp/restore/restore.log 2>&1"
RESTORE_RC=$?
set -e
if ! docker cp "$DB_CONTAINER:/tmp/restore/restore.log" "$OUT_DIR/restore.log" >/dev/null 2>&1; then
  echo "    (لاگِ بازگردانی از کانتینر بیرون نیامد)"
fi
if [ "$RESTORE_RC" -ne 0 ]; then
  printf '    آخرین خطوطِ لاگ:\n'
  tail -20 "$OUT_DIR/restore.log" 2>/dev/null | sed 's/^/      /'
  die "بازگردانی با کدِ $RESTORE_RC شکست خورد. کلِ تراکنش برگشت.
لاگ: $OUT_DIR/restore.log
بکاپ **قابلِ اتکا نیست**. هیچ migrationی روی Production اجرا نمی‌شود."
fi
echo "    بازگردانی با کدِ ۰ تمام شد."

# ── ۷) مقایسهٔ دوطرفه ────────────────────────────────────────────────────────
say "۵/۵ — مقایسهٔ شمارشِ ردیف‌ها و اثرِ انگشتِ ساختاری"
in_db "-v ON_ERROR_STOP=1 -f /tmp/restore/inventory.sql -o /tmp/restore/inventory-restored.txt" \
  || die "اثرِ انگشتِ مقصد خوانده نشد."
docker cp "$DB_CONTAINER:/tmp/restore/inventory-restored.txt" "$OUT_DIR/inventory-restored.txt" \
  || die "اثرِ انگشتِ مقصد از کانتینر بیرون نیامد."

set +e
node "$COMPARE_JS" "$OUT_DIR/inventory-source.txt" "$OUT_DIR/inventory-restored.txt" \
  --source-after "$OUT_DIR/inventory-source-after.txt" \
  --report "$OUT_DIR/comparison.txt"
COMPARE_RC=$?
set -e

# ── ۸) manifest ──────────────────────────────────────────────────────────────
# سه حالت، نه دو. «تأییدنشده» نه PASS است نه FAIL — و هیچ‌کدام نباید
# دیگری را بپوشاند.
case "$COMPARE_RC" in
  0) VERDICT="PASS (structure verified · row counts exactly equal)" ;;
  2) VERDICT="PARTIAL (structure verified · row-count equality NOT proven)" ;;
  *) VERDICT="FAIL" ;;
esac
write_manifest "$VERDICT"

echo
if [ "$COMPARE_RC" -eq 2 ]; then
  cat <<EOS
⚠️ بکاپ ساخته شد، بازگردانی کار کرد و **ساختار تأیید شد** — ولی برابریِ
   دادهٔ جدول‌هایی که حینِ بکاپ زنده بوده‌اند **اثبات نشد**.

این **PASS نیست.** جزئیات: $OUT_DIR/comparison.txt

بکاپ احتمالاً سالم است؛ ما فقط نمی‌توانیم اثباتش کنیم. تا وقتی مقایسه با
snapshotِ مشترکِ dump ممکن نشود، این وضعیت به‌تنهایی مجوزِ اجرای migration
روی Production **نمی‌دهد**.

مسیر: $OUT_DIR
EOS
  exit 2
fi

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
