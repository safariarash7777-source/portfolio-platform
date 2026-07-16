// خروجی CSV تاریخچهٔ نماد — عمومی و رایگان (بخشی از «بانک دادهٔ بازار»).
// GET /api/data/[symbol]/history.csv → همهٔ روزهای موجود در symbol_history.
// دادهٔ ناموجود = سلول خالی؛ هیچ عدد ساختگی.

import { getSymbolHistory } from "@/lib/core/history";

export const dynamic = "force-dynamic";

const HEADER =
  "trade_date,close,last_price,volume,value_traded," +
  "individual_buy_value,individual_sell_value,individual_buy_count," +
  "individual_sell_count,legal_buy_value,legal_sell_value,buyer_power";

function cell(v: number | string | null | undefined): string {
  if (v == null) return "";
  return String(v);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym = decodeURIComponent(symbol);

  // سقف بزرگ: کل تاریخچهٔ ۲۰ ساله (~۴۶۰۰ روز) — getSymbolHistory سقف limit=4000×… دارد
  const rows = await getSymbolHistory(sym, 20000);

  const lines = [HEADER];
  for (const d of rows) {
    lines.push(
      [
        d.trade_date,
        cell(d.close),
        cell(d.last_price),
        cell(d.volume),
        cell(d.value_traded),
        cell(d.individual_buy_value),
        cell(d.individual_sell_value),
        cell(d.individual_buy_count),
        cell(d.individual_sell_count),
        cell(d.legal_buy_value),
        cell(d.legal_sell_value),
        cell(d.buyer_power),
      ].join(",")
    );
  }

  const body = "\uFEFF" + lines.join("\n"); // BOM برای اکسل فارسی
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(sym)}-history.csv"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
