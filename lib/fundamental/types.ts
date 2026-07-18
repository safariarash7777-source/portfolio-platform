// قرارداد دادهٔ نرمال‌شدهٔ موتور بنیادی کدال (WP4).
// اسکیمای ن-۱۰ دقیقاً مطابق نمونهٔ اعتبارسنجی‌شدهٔ docs/i1-fameli-1404.md §۷ است —
// پارسر اکسل آینده باید همین شکل را تولید کند تا UI بدون تغییر کار کند.
// اسکیمای ن-۳۰ (فعالیت ماهانه) برای فاز بعدی تعریف شده؛ تا وقتی دادهٔ واقعی
// (اکسل کدال) نیامده هیچ مقداری برایش ساخته نمی‌شود (قانون ۳ بریف).

/** یک ردیف صورت سود و زیان (واحد: میلیون ریال). */
export interface IncomeStatement {
  revenue: number;
  cogs: number;
  gross_profit: number;
  sga?: number;
  other_op_income?: number;
  other_op_expense?: number;
  operating_profit: number;
  finance_cost?: number;
  pretax_profit?: number;
  tax?: number;
  net_profit: number;
  eps_rial?: number;
}

/** ردیف روند چندسالهٔ فروش (جدول رسمی خود گزارش). */
export interface SalesTrendRow {
  fy: number; // سال مالی جلالی، مثل 1404
  revenue: number;
  cogs: number;
}

/** برآورد خودِ شرکت — هرگز به‌عنوان عدد قطعی ارائه نمی‌شود (قانون ۷). */
export interface CompanyEstimate {
  revenue: number;
  cogs: number;
  is_estimate: true;
  source: string;
}

/** دادهٔ نرمال‌شدهٔ گزارش ن-۱۰ (صورت‌های مالی) — مطابق codal_reports.data. */
export interface CodalN10Data {
  symbol: string;
  company_name: string;
  report_kind: "ن-۱۰";
  period_end: string; // جلالی YYYY-MM-DD مثل "1404-12-29"
  period_months: number;
  audited: boolean;
  restated_prior: boolean;
  unit: string; // «میلیون ریال»
  capital: number;
  auditor?: string;
  standalone: IncomeStatement & { prior?: IncomeStatement };
  consolidated?: Partial<IncomeStatement> & {
    net_profit_parent?: number;
    eps_base_rial?: number;
  };
  sales_trend_5y?: SalesTrendRow[];
  company_estimate_1405?: CompanyEstimate;
  dividend?: {
    fy1403_net: number;
    board_proposed: number;
    agm_approved: number;
    retained_end_1403: number;
  };
}

/** یک محصول در گزارش ماهانهٔ ن-۳۰ — برای فاز بعد (نیازمند اکسل کدال). */
export interface N30ProductRow {
  product_name: string;
  market: "داخلی" | "صادراتی";
  production_qty: number | null;
  sales_qty: number | null;
  sales_rate: number | null; // ریال بر واحد
  sales_amount: number | null; // میلیون ریال
}

/** دادهٔ نرمال‌شدهٔ گزارش ن-۳۰ (فعالیت ماهانه) — برای فاز بعد. */
export interface CodalN30Data {
  symbol: string;
  report_kind: "ن-۳۰";
  period_end: string; // ماه جلالی
  fiscal_year: number;
  products: N30ProductRow[];
  period_total_amount: number;
  fy_cumulative_amount: number;
}

/** متادیتای منبع هر گزارش — شفافیت مبدأ داده در UI (قانون ۳). */
export interface ReportSource {
  title: string; // مثل «صورت‌های مالی ۱۲ماههٔ حسابرسی‌شدهٔ ۱۴۰۴»
  source_url: string | null; // URL اطلاعیهٔ codal.ir؛ تا نیامده null می‌ماند
  verified: boolean; // اعتبارسنجی متقاطع انجام شده؟
  verification_note?: string;
}

/** بستهٔ دادهٔ بنیادی یک نماد که به صفحهٔ نماد تزریق می‌شود. */
export interface SymbolFundamentals {
  symbol: string;
  n10: { data: CodalN10Data; source: ReportSource } | null;
  n30: { data: CodalN30Data[]; source: ReportSource } | null;
  /** T3: همهٔ دوره‌های ن-۱۰ پس از dedup نسخه‌ها (با id ردیف برای تقدم اصلاحیه) — ورودی فصل‌سازی. */
  n10Periods?: Array<{ id: number; data: CodalN10Data }>;
}
