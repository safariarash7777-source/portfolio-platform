# pgurl.sh - sourced INSIDE the postgres:17-alpine container (busybox ash).
#
# Shared by scripts/backup-production.ps1 and scripts/backup-production.sh so
# the connection string is handled ONE way. Kept ASCII-only for the same reason
# as the .ps1 (see its header).
#
# Reads exactly one line from stdin: the connection URI. Leaves behind:
#   PGURL       the URI WITHOUT the password  -> safe to put in psql argv
#   PGPASSWORD  the decoded password, exported -> environment, not argv
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
#     to PGPASSWORD. Userinfo is split the way libpq does: at the FIRST '@'
#     before any '/', user and password at the FIRST ':'. Percent-decoding
#     follows RFC 3986 (no '+' -> space).
#   * a password with percent-encoded bytes >= 0x80 is left in the URI (and
#     therefore in argv), with a warning: busybox awk cannot emit raw bytes
#     reliably, and a wrong decode would fail authentication for no visible
#     reason. Supabase-generated passwords are ASCII.
#
# Residual exposure, stated rather than hidden: PGPASSWORD is readable from
# /proc/<pid>/environ by root inside the container and on the Docker VM.

IFS= read -r PGURL || true
PGURL=$(printf '%s' "$PGURL" | tr -d '\r')
pgurl_bom=$(printf '\357\273\277')
PGURL=${PGURL#"$pgurl_bom"}

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
pgurl_auth=${pgurl_rest%%@*}
if [ "$pgurl_auth" != "$pgurl_rest" ]; then
  case $pgurl_auth in
    */*) : ;;  # the '@' is after the authority - there is no userinfo
    *:*)
      pgurl_pw=${pgurl_auth#*:}
      case $pgurl_pw in
        *%[89A-Fa-f]?*)
          echo 'pgurl: password has non-ASCII bytes; it stays in the URI and is visible in the process list' >&2
          ;;
        *)
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
          export PGPASSWORD
          PGURL="$pgurl_scheme://${pgurl_auth%%:*}@${pgurl_rest#*@}"
          ;;
      esac
      ;;
  esac
fi
unset pgurl_scheme pgurl_rest pgurl_auth pgurl_pw pgurl_bom

# pgurl_psql ARGS... - the ONE way callers start psql against the URI.
#
# Callers pass their psql arguments WITHOUT double quotes. Windows PowerShell
# 5.1 does not escape embedded double quotes when it builds a native command
# line, so `sh -c '... "$PGURL" -c "SELECT 1"'` reached docker split in the
# wrong places (psql received `-c SELECT`). Reproduced on PowerShell 7.4 with
# $PSNativeCommandArgumentPassing = 'Legacy', which is the 5.1 behaviour.
# The quoting of the URI now lives here, inside sh, where it is safe.
pgurl_psql() {
  exec psql -w "$PGURL" "$@"
}
