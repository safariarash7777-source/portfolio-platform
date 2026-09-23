#!/usr/bin/env bash
#
# پیش‌پرواز روی خودِ سرور — قبل و بعد از بالا آوردنِ استک.
#
#   sudo bash scripts/selfhost/preflight-vps.sh
#
# می‌سنجد (فقط می‌خواند، چیزی تغییر نمی‌دهد):
#   • Docker ≥ 25 و Compose ≥ 2.24.4 (تگِ `!override` در docker-compose.portfolio.yml)
#   • میرورِ رجیستری تنظیم شده (از ایران، pullِ مستقیم از Docker Hub قابلِ اتکا نیست)
#   • حافظه ≥ ۴ گیگ و دیسکِ آزاد ≥ ۲۰ گیگ (حداقلِ رسمیِ Supabaseِ خودمیزبان: 4GB/2CPU/40GB)
#   • هیچ سوکتی جز 22، 80 و 443 روی رابطِ عمومی گوش نمی‌دهد — 5432/6543/8000/3000
#     باید فقط روی 127.0.0.1 باشند. Docker قوانینِ iptables خودش را می‌نویسد و ufw
#     پورتِ منتشرشده را پنهان نمی‌کند؛ پس این بررسی روی خودِ سوکت‌هاست.

set -uo pipefail

SS_CMD="${PREFLIGHT_SS_CMD:-ss -H -ltn}"
ALLOWED_PUBLIC="${PREFLIGHT_ALLOWED_PUBLIC:-22 80 443}"
FAIL=0
pass() { printf '  ✅ %s\n' "$*"; }
fail() { printf '  ❌ %s\n' "$*"; FAIL=1; }
warn() { printf '  ⚠️  %s\n' "$*"; }

ver_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

if [ -z "${PREFLIGHT_SKIP_HOST:-}" ]; then
  DV="$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
  if [ -n "$DV" ] && ver_ge "$DV" 25.0.0; then pass "Docker $DV"; else fail "Docker ≥ 25 لازم است (یافت: ${DV:-نیست})"; fi
  CV="$(docker compose version --short 2>/dev/null | sed 's/^v//' || true)"
  if [ -n "$CV" ] && ver_ge "$CV" 2.24.4; then pass "Compose $CV"; else fail "Compose ≥ 2.24.4 لازم است (یافت: ${CV:-نیست})"; fi
  if grep -q '"registry-mirrors"' /etc/docker/daemon.json 2>/dev/null; then pass "میرورِ رجیستری تنظیم شده"
  else warn "میرورِ رجیستری تنظیم نشده (docs.liara.ir → mirrors/docker)"; fi
  MEM_KB="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
  if [ "${MEM_KB:-0}" -ge 3800000 ]; then pass "حافظه $((MEM_KB/1024/1024)) گیگ"; else fail "حافظه کمتر از ۴ گیگ"; fi
  FREE_GB="$(df -BG --output=avail / | tail -1 | tr -dc '0-9')"
  if [ "${FREE_GB:-0}" -ge 20 ]; then pass "دیسکِ آزاد ${FREE_GB} گیگ"; else fail "دیسکِ آزاد کمتر از ۲۰ گیگ"; fi
fi

# سوکت‌های گوش‌دهنده: ستونِ چهارم «آدرس:پورت» است.
PUBLIC_BAD=""
while read -r line; do
  addr="$(printf '%s' "$line" | awk '{print $4}')"
  [ -n "$addr" ] || continue
  port="${addr##*:}"
  host="${addr%:*}"
  case "$host" in
    127.*|"[::1]"|localhost) continue ;;
  esac
  case " $ALLOWED_PUBLIC " in
    *" $port "*) continue ;;
  esac
  PUBLIC_BAD="$PUBLIC_BAD $host:$port"
done < <($SS_CMD 2>/dev/null)

if [ -z "$PUBLIC_BAD" ]; then pass "فقط $ALLOWED_PUBLIC روی رابطِ عمومی گوش می‌دهند"
else fail "روی رابطِ عمومی باز است:$PUBLIC_BAD"; fi

if [ "$FAIL" -eq 0 ]; then echo "پیش‌پرواز: قبول"; else echo "پیش‌پرواز: مردود"; fi
exit "$FAIL"
