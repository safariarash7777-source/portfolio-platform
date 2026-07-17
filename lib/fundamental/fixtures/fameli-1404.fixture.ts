// دادهٔ واقعی و اعتبارسنجی‌شدهٔ گزارش ن-۱۰ فملی — ۱۲ماههٔ حسابرسی‌شدهٔ ۱۴۰۴.
// منبع: docs/archive/i1-fameli-1404.md (استخراج مستقیم از PDF رسمی کدال + چک‌های حسابی
// متقابل: سود ناخالص = فروش − بها، EPS = سود ÷ تعداد سهم، تطبیق درصدهای چاپ‌شده).
// هیچ عددی برآورد یا گرد نشده مگر با برچسب صریح is_estimate.
// درج در جدول codal_reports منتظر source_url واقعی اطلاعیه است (i1 §۹-۳)؛
// تا آن موقع این ماژول «تنها منبع» دادهٔ بنیادی فملی در UI است.

import type { CodalN10Data, ReportSource, SymbolFundamentals } from "../types";

export const FAMELI_N10_1404: CodalN10Data = {
  symbol: "فملی",
  company_name: "ملی صنایع مس ایران",
  report_kind: "ن-۱۰",
  period_end: "1404-12-29",
  period_months: 12,
  audited: true,
  restated_prior: true,
  unit: "میلیون ریال",
  capital: 1_050_000_000,
  auditor: "وانیا نیک تدبیر",
  standalone: {
    revenue: 3_218_894_510,
    cogs: 1_354_424_181,
    gross_profit: 1_864_470_329,
    sga: 268_030_027,
    other_op_income: 289_398_665,
    other_op_expense: 79_412_327,
    operating_profit: 1_806_426_640,
    finance_cost: 12_161_894,
    pretax_profit: 1_804_015_835,
    tax: 298_003_870,
    net_profit: 1_506_011_965,
    eps_rial: 1_434,
    prior: {
      revenue: 1_789_892_699,
      cogs: 806_422_709,
      gross_profit: 983_469_990,
      operating_profit: 932_618_497,
      net_profit: 785_868_563,
      eps_rial: 748,
    },
  },
  consolidated: {
    revenue: 3_202_432_097,
    gross_profit: 1_837_345_426,
    operating_profit: 1_782_474_050,
    net_profit: 1_460_550_037,
    net_profit_parent: 1_456_442_527,
    eps_base_rial: 1_430,
    finance_cost: 13_617_756,
  },
  sales_trend_5y: [
    { fy: 1399, revenue: 422_406_136, cogs: 135_620_149 },
    { fy: 1400, revenue: 908_467_601, cogs: 273_299_377 },
    { fy: 1401, revenue: 883_086_976, cogs: 362_855_167 },
    { fy: 1402, revenue: 1_275_665_322, cogs: 520_534_172 },
    { fy: 1403, revenue: 1_789_892_699, cogs: 806_422_709 },
    { fy: 1404, revenue: 3_218_894_510, cogs: 1_354_424_181 },
  ],
  company_estimate_1405: {
    revenue: 5_187_497_535,
    cogs: 2_460_192_922,
    is_estimate: true,
    source: "برآورد مدیریت در همین گزارش",
  },
  dividend: {
    fy1403_net: 785_868_563,
    board_proposed: 78_586_856,
    agm_approved: 388_500_000,
    retained_end_1403: 1_091_469_452,
  },
};

export const FAMELI_N10_SOURCE: ReportSource = {
  title: "اطلاعات و صورت‌های مالی ۱۲ماههٔ منتهی به ۱۴۰۴/۱۲/۲۹ — حسابرسی‌شده",
  source_url: null, // منتظر URL واقعی اطلاعیه در codal.ir (کلید یکتای dedup)
  verified: true,
  verification_note:
    "اعتبارسنجی متقاطع: جمع اجزای سود، EPS = سود ÷ سرمایه، تطبیق با جدول روند ۵ساله و تقسیم سود (docs/archive/i1-fameli-1404.md §۸)",
};

/** بستهٔ بنیادی فملی — ن-۳۰ هنوز ندارد (منتظر اکسل کدال؛ بلاکر §۷ بریف). */
export const FAMELI_FUNDAMENTALS: SymbolFundamentals = {
  symbol: "فملی",
  n10: { data: FAMELI_N10_1404, source: FAMELI_N10_SOURCE },
  n30: null,
};
