#!/usr/bin/env bash
#
# بازگردانیِ بکاپِ Production روی Supabaseِ خودمیزبان — **روی خودِ سرور** اجرا می‌شود.
#
#   sudo bash scripts/selfhost/restore-to-selfhost.sh /root/restore/prod-<STAMP>
#
# ورودی همان پوشه‌ای است که `scripts/backup-production.sh` (یا نسخهٔ ps1) می‌سازد:
#   roles.sql · schema.sql · data.sql · inventory-source.txt [· inventory-source-after.txt]
# پیاده‌سازیِ موازی نیست: همان سه فایل، همان ترتیبِ رسمیِ Supabase، همان
# `inventory.sql` و `compare.mjs` که آزمونِ بازگردانیِ #155 از آن‌ها استفاده می‌کند.
#
# ── چرا روی خودِ سرور ─────────────────────────────────────────────────────────
# پورتِ Postgres عمداً فقط روی 127.0.0.1ِ سرور است (docker-compose.portfolio.yml).
# اجرای psql **داخلِ کانتینرِ db** یعنی نه تونلی لازم است، نه پورتی باز می‌شود،
# نه نسخهٔ psql با سرور ناهمخوان است، و رمز هرگز در argvِ میزبان دیده نمی‌شود:
# psql رمز را از متغیرِ محیطیِ خودِ کانتینر (`POSTGRES_PASSWORD`) می‌خواند.
#
# ── چرا supabase_admin ────────────────────────────────────────────────────────
# roles.sql تنظیماتی مثلِ `log_min_messages` را روی نقش‌ها می‌گذارد که فقط
# superuser مجاز است. آزمونِ ایزولهٔ Codex (۲۰۲۶-۰۹) همین را نشان داد: با
# `postgres` شکست، با `supabase_admin` موفق.
#
# ── قواعد ────────────────────────────────────────────────────────────────────
#   • مقصد باید **تازه** باشد: اگر `public` حتی یک جدول دارد، اجرا نمی‌شود. این
#     اسکریپت هرگز روی داده‌ای بازگردانی نمی‌کند (نه upsert، نه overwrite).
#   • بازگردانی در **یک تراکنش** با `ON_ERROR_STOP=1`؛ معیار کدِ خروجیِ psql است.
#   • پوشهٔ بکاپ باید mode 700 باشد: دادهٔ واقعیِ اعضا در آن است.
#   • هیچ مقداری از .env یا داده چاپ نمی‌شود؛ گزارش فقط شمارش و نتیجه است.
#
# آزمون: lib/ops/selfhost-restore.integration.test.ts (با SELFHOST_TEST_PSQL،
# بدونِ Docker، روی Postgresِ محلی).

set -euo pipefail

BACKUP_DIR="${1:-}"
PROJECT_DIR="${PROJECT_DIR:-/opt/supabase-project}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SQL="$HERE/../backup"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n❌ %s\n' "$*" >&2; exit 1; }

# ── psql: داخلِ کانتینرِ db، یا در آزمون یک wrapper ─────────────────────────
if [ -n "${SELFHOST_TEST_PSQL:-}" ]; then
  q() { "$SELFHOST_TEST_PSQL" "$@"; }
else
  q() {
    (cd "$PROJECT_DIR" && docker compose exec -T db \
      sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h 127.0.0.1 -U supabase_admin -d postgres "$@"' psql "$@")
  }
fi

# ── ۰) ورودی ─────────────────────────────────────────────────────────────────
[ -n "$BACKUP_DIR" ] || die "مسیرِ پوشهٔ بکاپ را بده: restore-to-selfhost.sh <dir>"
[ -d "$BACKUP_DIR" ] || die "پوشهٔ بکاپ نیست: $BACKUP_DIR"
for f in roles schema data; do
  [ -s "$BACKUP_DIR/$f.sql" ] || die "$f.sql نیست یا خالی است — بکاپ ناقص است."
done
[ -s "$BACKUP_DIR/inventory-source.txt" ] || die "inventory-source.txt نیست — بدونِ اثرِ انگشتِ مبدأ مقایسه ممکن نیست."
SRC_AUTH="$(tr -d '[:space:]' < "$BACKUP_DIR/auth-version.txt" 2>/dev/null || true)"
printf '%s' "$SRC_AUTH" | grep -Eq '^[0-9]{14}$' || die "auth-version.txt نیست یا نامعتبر است — بکاپ با نسخهٔ پیش از #155@8c6ca43 گرفته شده؛ دوباره بکاپ بگیر."
MODE="$(stat -c %a "$BACKUP_DIR" 2>/dev/null || stat -f %Lp "$BACKUP_DIR")"
[ "$MODE" = "700" ] || die "پوشهٔ بکاپ باید mode 700 باشد (الان $MODE): دادهٔ واقعیِ اعضا در آن است."

if [ -z "${SELFHOST_TEST_PSQL:-}" ]; then
  [ -f "$PROJECT_DIR/docker-compose.yml" ] || die "پروژهٔ Supabase در $PROJECT_DIR نیست (PROJECT_DIR را تنظیم کن)."
  HEALTH="$(cd "$PROJECT_DIR" && docker compose ps --format '{{.Health}}' db 2>/dev/null || true)"
  [ "$HEALTH" = "healthy" ] || die "کانتینرِ db سالم نیست (وضعیت: ${HEALTH:-نامعلوم})."
fi

# ── ۱) مقصد باید superuser و تازه باشد ────────────────────────────────────────
say "۱/۵ — بررسیِ مقصد"
SUPER="$(q -X -q -t -A -c "SELECT rolsuper FROM pg_roles WHERE rolname = current_user" | tr -d '[:space:]')"
[ "$SUPER" = "t" ] || die "نقشِ اتصال superuser نیست؛ roles.sql روی آن شکست می‌خورد (با supabase_admin وصل شو)."
TABLES="$(q -X -q -t -A -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" | tr -d '[:space:]')"
[ "$TABLES" = "0" ] || die "مقصد تازه نیست: $TABLES جدول در public دارد. این اسکریپت روی داده بازگردانی نمی‌کند.
یک استکِ تازه بساز (یا عمداً پاکش کن) و دوباره اجرا کن."
q -X -q -v ON_ERROR_STOP=1 -f - < "$BACKUP_SQL/assert-managed-schemas.sql" \
  || die "مقصد اسکیماهای مدیریت‌شده (auth/storage) را ندارد؛ Supabaseِ کامل نیست."
# Authِ مقصد باید دست‌کم به‌اندازهٔ Production تازه باشد: ۲۰۲۶۰۸۳۱۱۸۰۰۰۰ ستونِ
# auth.one_time_tokens.expires_at را افزود (gotrue ≥ v2.197.0). Authِ قدیمی‌تر آن
# ستون را ندارد و dumpِ داده بار نمی‌شود.
DST_AUTH="$(q -X -q -t -A -c "SELECT max(version) FROM auth.schema_migrations" | tr -d '[:space:]')" \
  || die "نسخهٔ طرحِ Authِ مقصد خوانده نشد."
printf '%s' "$DST_AUTH" | grep -Eq '^[0-9]{14}$' || die "نسخهٔ طرحِ Authِ مقصد نامعتبر است."
if [[ "$DST_AUTH" < "$SRC_AUTH" ]]; then
  die "طرحِ Authِ مقصد ($DST_AUTH) از Production ($SRC_AUTH) قدیمی‌تر است. هیچ داده‌ای بازگردانی نشد.
تصویرِ auth را به supabase/gotrue ≥ v2.197.0 برسان (docker-compose.portfolio.yml) و استک را تازه بساز."
fi
echo "    superuser ✓ · public خالی ✓ · auth/storage موجود ✓ · Auth $DST_AUTH ≥ $SRC_AUTH"

# ── ۲) بازگردانیِ اتمیک ───────────────────────────────────────────────────────
say "۲/۵ — بازگردانی در یک تراکنش (ON_ERROR_STOP=1)"
LOG="$BACKUP_DIR/restore-selfhost.log"
set +e
{
  cat "$BACKUP_DIR/roles.sql"
  cat "$BACKUP_DIR/schema.sql"
  printf '\nSET session_replication_role = replica;\n'
  cat "$BACKUP_DIR/data.sql"
} | q --single-transaction -X -q -v ON_ERROR_STOP=1 -f - > "$LOG" 2>&1
RC=$?
set -e
chmod 600 "$LOG"
if [ "$RC" -ne 0 ]; then
  tail -5 "$LOG" | sed 's/^/      /' >&2
  die "بازگردانی با کدِ $RC شکست خورد؛ کلِ تراکنش برگشت و مقصد تازه ماند. لاگ: $LOG"
fi
echo "    کدِ خروجی ۰"

# ── ۳) اثرِ انگشتِ مقصد و مقایسهٔ دوطرفه ───────────────────────────────────────
say "۳/۵ — مقایسه با اثرِ انگشتِ مبدأ"
q -X -q -v ON_ERROR_STOP=1 -f - < "$BACKUP_SQL/inventory.sql" > "$BACKUP_DIR/inventory-selfhost.txt" \
  || die "اثرِ انگشتِ مقصد خوانده نشد."
COMPARE_RC=3
if command -v node >/dev/null 2>&1; then
  AFTER=()
  [ -s "$BACKUP_DIR/inventory-source-after.txt" ] && AFTER=(--source-after "$BACKUP_DIR/inventory-source-after.txt")
  set +e
  node "$BACKUP_SQL/compare.mjs" "$BACKUP_DIR/inventory-source.txt" "$BACKUP_DIR/inventory-selfhost.txt" \
    "${AFTER[@]}" --report "$BACKUP_DIR/comparison-selfhost.txt"
  COMPARE_RC=$?
  set -e
else
  echo "    node روی سرور نیست؛ inventory-selfhost.txt را به لپ‌تاپ بیاور و compare.mjs را آنجا اجرا کن."
fi

# ── ۴) گزارشِ وابستگی‌های ابری (فقط روی مقصد، بدونِ هیچ تغییری) ───────────────
# کارهای pg_cronِ Production آدرسِ `*.supabase.co/functions/v1/...` را صدا می‌زنند.
# این اسکریپت آن‌ها را حذف، غیرفعال یا کند **نمی‌کند** — فقط نام می‌برد؛ مقصدِ
# تازه‌شان تصمیمِ مالک است.
say "۴/۵ — گزارشِ کارهای زمان‌بندیِ وابسته به پروژهٔ ابری (بدونِ تغییر)"
q -X -v ON_ERROR_STOP=1 -f - < "$HERE/post-restore.sql" 2>&1 | sed -n 's/^.*NOTICE:  /    /p' \
  || die "post-restore.sql شکست خورد."

# ── ۵) نتیجه ──────────────────────────────────────────────────────────────────
say "۵/۵ — نتیجه"
case "$COMPARE_RC" in
  0) echo "    PASS — ساختار تأیید شد و همهٔ شمارش‌ها دقیقاً برابرند." ;;
  2) echo "    PARTIAL — ساختار تأیید شد، ولی برابریِ همهٔ شمارش‌ها اثبات نشد. PASS نیست." ;;
  3) echo "    COMPARE-PENDING — مقایسه اجرا نشد (node نیست). PASS نیست." ;;
  *) echo "    FAIL — مقایسه اختلاف یافت. گزارش: $BACKUP_DIR/comparison-selfhost.txt"; exit 1 ;;
esac
echo "    گزارش‌ها در $BACKUP_DIR (هیچ مقداری از .env یا داده چاپ نشد)."
[ "$COMPARE_RC" = "0" ] || exit 2
