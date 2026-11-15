export default function FundamentalReadNotice({ readFailed, stale = false, unitUnknown = 0 }: {
  readFailed: boolean;
  stale?: boolean;
  unitUnknown?: number;
}) {
  if (!readFailed && !stale && unitUnknown === 0) return null;
  return (
    <div role="status" className="rounded-xl border p-4 text-sm leading-7" style={{ borderColor: "var(--line-strong)", color: "var(--warning-ink)" }}>
      {readFailed ? <p>خواندن گزارش‌های بنیادی در این لحظه موفق نشد. نبود نمودار در این وضعیت به معنی نبود گزارش در بانک داده نیست.</p> : null}
      {stale ? <p>آخرین دادهٔ معتبرِ ماهانه نمایش داده می‌شود. دریافت نسخهٔ تازه در این لحظه موفق نشد.</p> : null}
      {unitUnknown > 0 ? <p>بعضی گزارش‌های ماهانه ذخیره شده‌اند، اما واحد مبلغ آن‌ها مشخص نیست. مبلغ و مقایسه‌های وابسته تا تأیید واحد نمایش داده نمی‌شوند؛ نمودارهای موجود فقط دوره‌های دارای واحد مشخص را پوشش می‌دهند.</p> : null}
    </div>
  );
}
