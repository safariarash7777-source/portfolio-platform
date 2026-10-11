export default function FundamentalReadNotice({ readFailed, unitUnknown = 0 }: {
  readFailed: boolean;
  unitUnknown?: number;
}) {
  if (!readFailed && unitUnknown === 0) return null;
  return (
    <div role="status" className="rounded-xl border p-4 text-sm leading-7" style={{ borderColor: "var(--line-strong)", color: "var(--warning-ink)" }}>
      {readFailed ? <p>خواندن گزارش‌های بنیادی در این لحظه موفق نشد. نبود نمودار در این وضعیت به معنی نبود گزارش در بانک داده نیست.</p> : null}
      {unitUnknown > 0 ? <p>بعضی گزارش‌های ماهانه ذخیره شده‌اند، اما واحد مبلغ آن‌ها مشخص نیست. مبلغ و مقایسه‌های وابسته تا تأیید واحد نمایش داده نمی‌شوند؛ نمودارهای موجود فقط دوره‌های دارای واحد مشخص را پوشش می‌دهند.</p> : null}
    </div>
  );
}
