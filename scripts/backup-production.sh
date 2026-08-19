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
#     با `read -rs` پرسیده می‌شود و فقط داخلِ همین پروسه زندگی می‌کند.
#   • فایل‌های بکاپ **بیرون از مخزن** ساخته می‌شوند و اسکریپت اگر ببیند مقصد
#     داخلِ یک ریپوی گیت است، اجرا نمی‌شود.
#   • بکاپ فقط وقتی «سالم» اعلام می‌شود که واقعاً در یک Postgresِ یک‌بارمصرف
#     **بازگردانده** شده باشد و شمارشِ ردیف‌هایش با Production بخواند.
#
# ⚠️ تنها نشتِ باقی‌مانده: `supabase db dump` رشتهٔ اتصال را به‌صورتِ آرگومان
#    می‌گیرد، پس تا لحظهٔ اجرا در خروجیِ `ps` دیده می‌شود. روی لپ‌تاپِ شخصی
#    اهمیتِ عملی ندارد، ولی روی ماشینِ مشترک این اسکریپت را اجرا نکن.
#
# پیش‌نیاز: Docker (خودِ CLI هم `pg_dump` را داخلِ کانتینر اجرا می‌کند) و
#           Supabase CLI (`npx supabase` هم کافی است).

set -euo pipefail

PG_IMAGE="postgres:17-alpine"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${BACKUP_DIR:-$HOME/supabase-backups/prod-$STAMP}"
VERIFY_CONTAINER="prodbackup-verify-$STAMP"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n❌ %s\n' "$*" >&2; exit 1; }

# ── ۰) مقصد باید بیرونِ هر مخزنِ گیت باشد ────────────────────────────────────
# عمداً **اولین** بررسی است: ارزان‌ترین است و اگر مقصد غلط باشد، بهتر است کاربر
# قبل از هر کارِ دیگری بفهمد، نه بعد از راه‌اندازیِ Docker.
mkdir -p "$OUT_DIR"
if git -C "$OUT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  rmdir "$OUT_DIR" 2>/dev/null || true
  die "مقصد داخلِ یک مخزنِ گیت است: $OUT_DIR
فایلِ بکاپ هرگز نباید وارد مخزن شود. با BACKUP_DIR مسیرِ دیگری بده."
fi
chmod 700 "$OUT_DIR"

# ── ۱) پیش‌نیازها ────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "Docker نصب نیست. لازم است — هم CLI و هم مرحلهٔ راستی‌آزمایی به آن نیاز دارند."
docker info >/dev/null 2>&1 || die "Docker نصب هست ولی در حال اجرا نیست. Docker Desktop را باز کن."

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

# ── ۳) شمارشِ واقعیِ Production، پیش از بکاپ ─────────────────────────────────
# مبنای مقایسه از خودِ دیتابیس گرفته می‌شود، نه از عددی که در این فایل نوشته
# باشیم — وگرنه با رشدِ داده بی‌صدا کهنه می‌شد و راستی‌آزمایی بی‌معنا.
say "۱/۵ — شمارشِ ردیف‌های Production (فقط خواندن)"
read -r -d '' COUNT_SQL <<'SQL' || true
SELECT format('%s=%s', t, n) FROM (
  SELECT 'auth.users' t, count(*) n FROM auth.users
  UNION ALL SELECT 'profiles',        count(*) FROM public.profiles
  UNION ALL SELECT 'waitlist',        count(*) FROM public.waitlist
  UNION ALL SELECT 'payments',        count(*) FROM public.payments
  UNION ALL SELECT 'entitlements',    count(*) FROM public.entitlements
  UNION ALL SELECT 'symbol_history',  count(*) FROM public.symbol_history
  UNION ALL SELECT 'codal_reports',   count(*) FROM public.codal_reports
  UNION ALL SELECT 'codal_feed',      count(*) FROM public.codal_feed
  UNION ALL SELECT 'audit_log',       count(*) FROM public.audit_log
  UNION ALL SELECT 'content_hub',     count(*) FROM public.content_hub
  UNION ALL SELECT 'obj:tables',    count(*) FROM pg_tables WHERE schemaname='public'
  UNION ALL SELECT 'obj:policies',  count(*) FROM pg_policies WHERE schemaname='public'
  UNION ALL SELECT 'obj:indexes',   count(*) FROM pg_indexes WHERE schemaname='public'
  UNION ALL SELECT 'obj:functions', count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  UNION ALL SELECT 'obj:triggers',  count(*) FROM pg_trigger WHERE NOT tgisinternal
) s ORDER BY 1;
SQL

# `-e DB_URL` بدونِ `=` یعنی مقدار از محیط منتقل می‌شود و واردِ argv نمی‌شود.
docker run --rm -e DB_URL -i "$PG_IMAGE" \
  psql "$DB_URL" -X -q -A -t -c "$COUNT_SQL" > "$OUT_DIR/expected-counts.txt" \
  || die "اتصال به Production برقرار نشد. رشتهٔ اتصال را بررسی کن."
echo "شمارشِ مرجع ثبت شد:"
sed 's/^/    /' "$OUT_DIR/expected-counts.txt"

# ── ۴) سه فایلِ بکاپ، طبقِ روشِ رسمیِ Supabase ────────────────────────────────
say "۲/۵ — گرفتنِ بکاپ (roles · schema · data)"
"${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT_DIR/roles.sql"  --role-only
"${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT_DIR/schema.sql"
"${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT_DIR/data.sql"   --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"

for f in roles schema data; do
  [ -s "$OUT_DIR/$f.sql" ] || die "$f.sql خالی است — بکاپ ناقص است."
done

# ── ۵) راستی‌آزمایی: بازگرداندن در یک Postgresِ یک‌بارمصرف ────────────────────
# این مرحله همان چیزی است که «فایل ساخته شد» را به «بکاپ قابلِ بازیابی است»
# تبدیل می‌کند. Production در این مرحله اصلاً لمس نمی‌شود.
say "۳/۵ — بالا آوردنِ یک Postgresِ موقت برای آزمونِ بازگردانی"
cleanup() { docker rm -f "$VERIFY_CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$VERIFY_CONTAINER" \
  -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres \
  "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$VERIFY_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$VERIFY_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 \
  || die "Postgresِ موقت بالا نیامد."

say "۴/۵ — بازگردانی در محیطِ موقت"
# `roles.sql` نقش‌های مدیریتیِ Supabase را می‌سازد که در Postgresِ ساده وجود
# ندارند؛ خطای «نقش هست/نیست» اینجا طبیعی است و متوقف‌کننده نیست. آنچه اهمیت
# دارد شمارشِ نهایی است، نه بی‌خطا بودنِ لاگ.
for f in roles schema data; do
  # `session_replication_role = replica` طبقِ مستندِ رسمیِ Supabase: تریگرها حینِ
  # بازگردانیِ داده خاموش می‌شوند. بدونِ آن، گاردهای append-only این مخزن ممکن
  # است ردیف‌های بازگردانده‌شده را رد کنند و شمارش را خراب کنند.
  PRE=""
  [ "$f" = "data" ] && PRE="SET session_replication_role = replica;"
  docker exec -i "$VERIFY_CONTAINER" psql -U postgres -d postgres -q \
    ${PRE:+-c "$PRE"} < "$OUT_DIR/$f.sql" > "$OUT_DIR/restore-$f.log" 2>&1 || true
  ERRS=$(grep -ci '^ERROR' "$OUT_DIR/restore-$f.log" || true)
  printf '    %-7s → %s خطا در لاگ\n' "$f.sql" "$ERRS"
  # خطای roles روی Postgresِ ساده طبیعی است (نقش‌های Supabase وجود ندارند).
  # خطای schema یا data طبیعی **نیست**. پیش از این این عدد فقط چاپ می‌شد و
  # هیچ چیزی را متوقف نمی‌کرد — نشانگری که هرگز نمی‌توانست شکست بدهد.
  if [ "$f" != "roles" ] && [ "${ERRS:-0}" -gt 0 ]; then
    die "بازگردانیِ $f.sql با $ERRS خطا مواجه شد. جزئیات: $OUT_DIR/restore-$f.log"
  fi
done

say "۵/۵ — مقایسهٔ شمارشِ بازگردانده‌شده با Production"
RESTORED="$OUT_DIR/restored-counts.txt"
docker exec -i "$VERIFY_CONTAINER" psql -U postgres -d postgres -X -q -A -t \
  -c "$COUNT_SQL" > "$RESTORED" 2>/dev/null || true

MISMATCH=0
while IFS= read -r line; do
  key="${line%%=*}"
  want="${line#*=}"
  got="$(grep -E "^${key}=" "$RESTORED" | head -1 | cut -d= -f2 || true)"
  if [ "${got:-MISSING}" = "$want" ]; then
    printf '    ✅ %-16s %s\n' "$key" "$want"
  else
    printf '    ❌ %-16s انتظار %s ولی %s\n' "$key" "$want" "${got:-غایب}"
    MISMATCH=$((MISMATCH + 1))
  fi
done < "$OUT_DIR/expected-counts.txt"

# ── ۶) اثرِ انگشتِ فایل‌ها ────────────────────────────────────────────────────
say "فایل‌های بکاپ"
{
  echo "backup taken: $(date -u '+%Y-%m-%dT%H:%M:%SZ') UTC"
  echo "project:      uooeygybrniptzdxuzhj (production)"
  echo
  for f in roles schema data; do
    p="$OUT_DIR/$f.sql"
    printf '%-10s %10s bytes  sha256=%s\n' "$f.sql" "$(wc -c <"$p" | tr -d ' ')" "$(sha256sum "$p" | cut -d' ' -f1)"
  done
} | tee "$OUT_DIR/MANIFEST.txt"

echo
if [ "$MISMATCH" -eq 0 ]; then
  cat <<EOS
✅ بکاپ ساخته شد و **آزمونِ بازگردانی را پاس کرد**.

مسیر: $OUT_DIR

قدمِ بعد — فقط این دو خط را برای Claude بفرست (هیچ‌کدام حساس نیستند):

    $(sed -n '1p' "$OUT_DIR/MANIFEST.txt")
$(tail -3 "$OUT_DIR/MANIFEST.txt" | sed 's/^/    /')

⚠️ این پوشه را جای امنی نگه دار. دادهٔ واقعیِ کاربران داخلش است.
   واردِ مخزن، GitHub، تلگرام یا ایمیل نکن.
EOS
else
  die "بکاپ ساخته شد ولی $MISMATCH جدول در بازگردانی نخواند.
این یعنی بکاپ قابلِ اتکا **نیست**. لاگ‌ها: $OUT_DIR/restore-*.log
تا رفعِ این مشکل هیچ migrationی روی Production اجرا نمی‌شود."
fi
