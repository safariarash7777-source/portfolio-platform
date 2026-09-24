# pgurl.sh - sourced INSIDE the postgres:17-alpine container (busybox ash).
#
# Shared by scripts/backup-production.ps1 and scripts/backup-production.sh so
# the connection string is handled ONE way. Kept ASCII-only for the same reason
# as the .ps1 (see its header).
#
# Reads one line from stdin: the connection URI. When the URI carries no
# password (or still has the dashboard's [YOUR-PASSWORD] placeholder), reads a
# SECOND line: the password, typed separately. Leaves behind:
#   PGURL        the URI WITHOUT the password   -> safe to put in psql argv
#   PGPASSWORD   the raw password, exported     -> environment, not argv
#   PGURL_PWENC  the percent-encoded password, exported (for redaction only)
# and pgurl_canonical prints the URI with the password percent-encoded, which
# is what the Supabase CLI (--db-url) needs.
#
# Why each step exists (B-057):
#   * BOM: a UTF-8 byte-order mark (EF BB BF) in front of the URI, which
#     Windows PowerShell 5.1 emits whenever the pipe encoding carries a
#     preamble. It is stripped the same way as the CR.
#   * CR: a Windows PowerShell pipe into a native process ends the line with
#     CR LF. `read -r` strips only the LF, so the CR stayed in the URI and the
#     database became "postgres<CR>" ("does not exist").
#   * empty / not a URI: exit 64 BEFORE psql runs. An empty conninfo makes
#     psql fall back to the local unix socket and print an error about
#     /var/run/postgresql that looks nothing like the real cause.
#   * password: `exec psql "$PGURL"` used to put the password in psql's argv,
#     readable by anyone who can list processes on the Docker VM. It now goes
#     to PGPASSWORD.
#   * special characters (2026-09-24, owner's laptop): a password typed into
#     the URI as-is, with a '/' in it, was split the way libpq splits: at the
#     first '/', so libpq took part of the PASSWORD as the port and printed it
#     in "invalid integer value ... for connection option port". Now the
#     userinfo ends at the LAST '@' (a host never contains '@'), user and
#     password split at the FIRST ':', and the host part must look like
#     host[:port][/db][?params] or nothing is sent. A password that is a valid
#     percent-encoding is decoded (RFC 3986, no '+' -> space); anything else
#     is taken literally. Leading/trailing blanks around it are dropped.
#   * percent-encoded bytes >= 0x80 in the URI: refused with exit 64 and a
#     pointer to the separate password prompt (busybox awk cannot emit raw
#     bytes reliably). A typed password may contain any bytes.
#   * redaction: psql's stderr passes through pgurl_redact, which replaces
#     the password, its encoded form and every 6+ character alphanumeric run
#     of it with ***. Defence in depth: with the parsing above psql never sees
#     the password in its conninfo.
#
# Residual exposure, stated rather than hidden: PGPASSWORD is readable from
# /proc/<pid>/environ by root inside the container and on the Docker VM.

IFS= read -r PGURL || true
PGURL=$(printf '%s' "$PGURL" | tr -d '\r')
pgurl_bom=$(printf '\357\273\277')
PGURL=${PGURL#"$pgurl_bom"}
PGURL=$(printf '%s' "$PGURL" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')

if [ -z "$PGURL" ]; then
  echo 'pgurl: empty connection string on stdin - nothing was sent to psql' >&2
  exit 64
fi
case $PGURL in
  postgres://*|postgresql://*) ;;
  *)
    echo 'pgurl: stdin is not a postgres:// or postgresql:// URI - nothing was sent to psql' >&2
    exit 64
    ;;
esac

pgurl_scheme=${PGURL%%://*}
pgurl_rest=${PGURL#*://}
case $pgurl_rest in
  *@*) ;;
  *)
    echo 'pgurl: the connection string has no user@ part - nothing was sent to psql' >&2
    exit 64
    ;;
esac
pgurl_host=${pgurl_rest##*@}
pgurl_auth=${pgurl_rest%@*}
pgurl_user=${pgurl_auth%%:*}
pgurl_pw=
case $pgurl_auth in *:*) pgurl_pw=${pgurl_auth#*:} ;; esac
pgurl_pw=$(printf '%s' "$pgurl_pw" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')

if ! printf '%s' "$pgurl_user" | grep -Eq '^[A-Za-z0-9._-]+$'; then
  echo 'pgurl: the user name in the connection string is not valid - nothing was sent to psql' >&2
  exit 64
fi
if ! printf '%s' "$pgurl_host" | grep -Eq '^[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._-]*)?([?][A-Za-z0-9._=&%-]*)?$'; then
  echo 'pgurl: the part after the password is not host:port/database - nothing was sent to psql' >&2
  exit 64
fi

if [ -z "$pgurl_pw" ] || [ "$pgurl_pw" = '[YOUR-PASSWORD]' ]; then
  IFS= read -r pgurl_pw || true
  pgurl_pw=$(printf '%s' "$pgurl_pw" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  if [ -z "$pgurl_pw" ]; then
    echo 'pgurl: no password - the connection string has none and none was typed; nothing was sent to psql' >&2
    exit 64
  fi
  PGPASSWORD=$pgurl_pw
elif printf '%s' "$pgurl_pw" | grep -Eq "^([A-Za-z0-9._~!\$&'()*+,;=:-]|%[0-9A-Fa-f][0-9A-Fa-f])*\$"; then
  case $pgurl_pw in
    *%[89A-Fa-f]?*)
      echo 'pgurl: the password in the URI has percent-encoded non-ASCII bytes. Put [YOUR-PASSWORD] back in the connection string and type the password when asked. Nothing was sent to psql.' >&2
      exit 64
      ;;
  esac
  PGPASSWORD=$(printf '%s' "$pgurl_pw" | awk '
    BEGIN { hex = "0123456789abcdef" }
    {
      s = $0; out = ""; n = length(s)
      for (i = 1; i <= n; i++) {
        c = substr(s, i, 1)
        if (c == "%" && i + 2 <= n) {
          hi = index(hex, tolower(substr(s, i + 1, 1)))
          lo = index(hex, tolower(substr(s, i + 2, 1)))
          if (hi > 0 && lo > 0) { out = out sprintf("%c", (hi - 1) * 16 + (lo - 1)); i += 2; continue }
        }
        out = out c
      }
      printf "%s", out
    }')
else
  PGPASSWORD=$pgurl_pw
fi

# Percent-encode every byte that is not RFC 3986 "unreserved". od gives bytes,
# so non-ASCII passwords survive; awk only ever prints ASCII.
PGURL_PWENC=$(printf '%s' "$PGPASSWORD" | od -An -v -tx1 | awk '
  BEGIN { hex = "0123456789abcdef" }
  {
    for (i = 1; i <= NF; i++) {
      h = tolower($i)
      v = (index(hex, substr(h, 1, 1)) - 1) * 16 + index(hex, substr(h, 2, 1)) - 1
      if ((v >= 48 && v <= 57) || (v >= 65 && v <= 90) || (v >= 97 && v <= 122) || v == 45 || v == 46 || v == 95 || v == 126)
        printf "%c", v
      else
        printf "%%%s", toupper(h)
    }
  }')
export PGPASSWORD PGURL_PWENC
PGURL="$pgurl_scheme://$pgurl_user@$pgurl_host"
pgurl_canonical_url="$pgurl_scheme://$pgurl_user:$PGURL_PWENC@$pgurl_host"
unset pgurl_scheme pgurl_rest pgurl_auth pgurl_pw pgurl_bom pgurl_user pgurl_host

# pgurl_redact - stdin to stdout with the password removed. The secrets come
# from ENVIRON, never from awk's argv (which the process list would show).
pgurl_redact() {
  awk '
    BEGIN {
      n = 0
      if (ENVIRON["PGPASSWORD"] != "") s[++n] = ENVIRON["PGPASSWORD"]
      if (ENVIRON["PGURL_PWENC"] != "") s[++n] = ENVIRON["PGURL_PWENC"]
      m = split(ENVIRON["PGPASSWORD"], part, /[^A-Za-z0-9]+/)
      for (j = 1; j <= m; j++) if (length(part[j]) >= 6) s[++n] = part[j]
    }
    {
      line = $0
      for (k = 1; k <= n; k++) {
        out = ""; t = s[k]; L = length(t)
        while ((p = index(line, t)) > 0) { out = out substr(line, 1, p - 1) "***"; line = substr(line, p + L) }
        line = out line
      }
      print line
    }'
}

# pgurl_canonical - print the URI with the password percent-encoded, for the
# Supabase CLI. Only ever captured into a variable, never shown.
pgurl_canonical() {
  printf '%s\n' "$pgurl_canonical_url"
}

# pgurl_psql ARGS... - the ONE way callers start psql against the URI.
#
# Callers pass their psql arguments WITHOUT double quotes. Windows PowerShell
# 5.1 does not escape embedded double quotes when it builds a native command
# line, so `sh -c '... "$PGURL" -c "SELECT 1"'` reached docker split in the
# wrong places (psql received `-c SELECT`). Reproduced on PowerShell 7.4 with
# $PSNativeCommandArgumentPassing = 'Legacy', which is the 5.1 behaviour.
# The quoting of the URI now lives here, inside sh, where it is safe.
pgurl_psql() {
  pgurl_err=$(mktemp)
  psql -w "$PGURL" "$@" 2>"$pgurl_err"
  pgurl_rc=$?
  pgurl_redact < "$pgurl_err" >&2
  rm -f "$pgurl_err"
  return $pgurl_rc
}
