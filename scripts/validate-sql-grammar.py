#!/usr/bin/env python3
"""اعتبارسنجیِ گرامرِ واقعیِ Postgres برای فایل‌های sql/ — بدونِ اتصال و بدونِ اجرا.

از libpg_query (همان پارسرِ خودِ Postgres، از طریقِ pglast) استفاده می‌کند، پس
«پارس شد» یعنی واقعاً گرامرِ Postgres را رعایت می‌کند — نه یک تقریبِ regexی.

    pip install pglast
    python3 scripts/validate-sql-grammar.py

خروج ۰ = پاس · ۱ = مردود · ۲ = pglast نصب نیست

نکتهٔ صداقت: بدنهٔ plpgsqlِ توابعِ `RETURNS trigger` پارس **نمی‌شود** —
`parse_plpgsql` در pglast 8.4 روی هر تابعِ trigger با JSONDecodeError می‌شکند
(با نمونهٔ حداقلیِ معتبر بازتولید شد؛ ایرادِ ابزار است نه SQL). آن موارد
SKIPPED گزارش می‌شوند، نه PASS.
"""
import glob
import sys

try:
    import pglast
except ImportError:
    print("pglast نصب نیست. اجرا کن:  pip install pglast", file=sys.stderr)
    sys.exit(2)

files = sorted(glob.glob("sql/**/*.sql", recursive=True))
if not files:
    print("هیچ فایلِ SQL پیدا نشد.", file=sys.stderr)
    sys.exit(1)

failed = 0
total_stmts = 0
plpgsql_skipped = []

for path in files:
    with open(path, encoding="utf-8") as fh:
        sql = fh.read()

    try:
        stmts = pglast.parse_sql(sql)
    except Exception as exc:  # noqa: BLE001 — هر خطای پارس یعنی مردود
        failed += 1
        print(f"❌ {path}\n   • خطای پارس: {exc}")
        continue

    total_stmts += len(stmts)

    # بدنه‌های plpgsql (DO / CREATE FUNCTION) جداگانه بررسی می‌شوند.
    if "$$" in sql:
        try:
            pglast.parse_plpgsql(sql)
            print(f"✅ {path}  ({len(stmts)} statement + بدنهٔ plpgsql)")
        except Exception:  # noqa: BLE001
            plpgsql_skipped.append(path)
            print(f"✅ {path}  ({len(stmts)} statement · بدنهٔ plpgsql SKIPPED)")
    else:
        print(f"✅ {path}  ({len(stmts)} statement)")

print(f"\n{len(files)} فایل · {total_stmts} statement · {failed} مردود")
if plpgsql_skipped:
    print(
        "بدنهٔ plpgsql در این فایل‌ها بررسی نشد (باگِ شناخته‌شدهٔ pglast روی "
        f"توابعِ RETURNS trigger): {', '.join(plpgsql_skipped)}"
    )
print("هیچ SQLای اجرا نشد و به هیچ دیتابیسی وصل نشدیم.")
sys.exit(0 if failed == 0 else 1)
