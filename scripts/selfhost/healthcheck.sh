#!/usr/bin/env bash
#
# سلامت‌سنجیِ بیرونیِ Supabaseِ خودمیزبان — از هر جایی (لپ‌تاپ) اجرا می‌شود.
#
#   SELFHOST_URL=https://api.example.ir SELFHOST_ANON_KEY=<کلیدِ عمومی> \
#     bash scripts/selfhost/healthcheck.sh
#
# کلیدِ anon عمومی است (در مرورگرِ هر بازدیدکننده هست)؛ کلیدِ service_role هرگز
# به این اسکریپت داده نمی‌شود.
#
# «۲۰۰ گرفتم» اثباتِ سلامت نیست — این اسکریپت دو طرف را می‌سنجد:
#   باید کار کند : TLS معتبر · /auth/v1/health · خواندنِ عمومیِ PostgREST
#   نباید باشد   : ردیفِ محافظت‌شده برای anon · Studio/mcp/graphql روی لبهٔ عمومی
#                  · پورت‌های 5432/6543/8000/3000 از بیرون
# هر «نباید» که برقرار باشد، مثلِ هر «باید» که نباشد، شکست است.

set -uo pipefail

URL="${SELFHOST_URL:-}"
ANON="${SELFHOST_ANON_KEY:-}"
PUBLIC_TABLE="${SELFHOST_PUBLIC_TABLE:-ir_market_snapshots}"
PROTECTED_TABLE="${SELFHOST_PROTECTED_TABLE:-profiles}"
CLOSED_PORTS="${SELFHOST_CLOSED_PORTS:-5432 6543 8000 3000}"

[ -n "$URL" ] || { echo "SELFHOST_URL لازم است" >&2; exit 64; }
[ -n "$ANON" ] || { echo "SELFHOST_ANON_KEY لازم است" >&2; exit 64; }
case "$URL" in
  https://*) ;;
  http://*) [ "${HEALTHCHECK_ALLOW_HTTP:-}" = "1" ] || { echo "فقط https پذیرفته است" >&2; exit 64; } ;;
  *) echo "آدرس نامعتبر" >&2; exit 64 ;;
esac
URL="${URL%/}"
HOST="$(printf '%s' "$URL" | sed -E 's#^https?://##; s#[:/].*$##')"

FAIL=0
pass() { printf '  ✅ %s\n' "$*"; }
fail() { printf '  ❌ %s\n' "$*"; FAIL=1; }

# کدِ وضعیت و بدنه، بدونِ چاپِ هدرها (کلید در خروجی نمی‌آید).
fetch() { # $1=path  → sets CODE, BODY
  local out
  out="$(curl -sS -m 15 -w '\n%{http_code}' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" "$URL$1" 2>/dev/null)"
  CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"
  [ -n "$CODE" ] || CODE=000
}

echo "سلامت‌سنجیِ $HOST"

# ۱) TLS — curl بدونِ -k؛ گواهیِ نامعتبر یعنی کد 000.
fetch "/auth/v1/health"
if [ "$CODE" = "200" ]; then pass "auth/v1/health → 200 (TLS معتبر)"; else fail "auth/v1/health → $CODE"; fi

# ۲) خواندنِ عمومی
fetch "/rest/v1/$PUBLIC_TABLE?select=*&limit=1"
if [ "$CODE" = "200" ] && [ "${BODY:0:1}" = "[" ]; then pass "rest/v1/$PUBLIC_TABLE برای anon → 200"
else fail "rest/v1/$PUBLIC_TABLE برای anon → $CODE"; fi

# ۳) جدولِ محافظت‌شده: anon نباید هیچ ردیفی ببیند.
fetch "/rest/v1/$PROTECTED_TABLE?select=*&limit=1"
if { [ "$CODE" = "200" ] && [ "$(printf '%s' "$BODY" | tr -d '[:space:]')" = "[]" ]; } \
   || [ "$CODE" = "401" ] || [ "$CODE" = "403" ] || [ "$CODE" = "404" ]; then
  pass "rest/v1/$PROTECTED_TABLE برای anon → $CODE، بدونِ ردیف"
else
  fail "rest/v1/$PROTECTED_TABLE برای anon → $CODE — احتمالِ نشتِ ردیف؛ RLS را بررسی کن"
fi

# ۴) لبهٔ عمومی فقط auth و rest: بقیه باید 404 بدهند.
for p in / /mcp /graphql/v1 /storage/v1/bucket /functions/v1/telegram-sync /realtime/v1/api/ping; do
  fetch "$p"
  if [ "$CODE" = "404" ]; then pass "$p → 404"; else fail "$p → $CODE (باید روی لبهٔ عمومی نباشد)"; fi
done

# ۵) پورت‌هایی که فقط روی 127.0.0.1ِ سرورند نباید از بیرون باز باشند.
for port in $CLOSED_PORTS; do
  if timeout 5 bash -c "exec 3<>/dev/tcp/$HOST/$port" 2>/dev/null; then
    fail "پورتِ $port از بیرون باز است"
  else
    pass "پورتِ $port از بیرون بسته است"
  fi
done

if [ "$FAIL" -eq 0 ]; then echo "نتیجه: سالم"; else echo "نتیجه: ناسالم"; fi
exit "$FAIL"
