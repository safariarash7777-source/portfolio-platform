/**
 * کدهای خطای موتور → جملهٔ فارسی. جدا از کامپوننت نگه داشته شده تا آزمودنی
 * بماند و تغییرِ قرارداد موتور بی‌صدا از بین نرود.
 */
const ERROR_TEXT: Record<string, string> = {
  "initial-value": "سرمایهٔ اولیه باید عددی بزرگ‌تر از صفر باشد.",
  "empty-holdings": "حداقل یک دارایی لازم است.",
  "holding-id": "هر دارایی باید شناسهٔ یکتا داشته باشد.",
  weight: "وزن هر دارایی باید عددی بین ۰ تا ۱۰۰ باشد.",
  "weight-total": "جمع وزن‌ها باید دقیقاً ۱۰۰ درصد باشد؛ این ابزار وزن‌ها را خودش نرمال نمی‌کند.",
  return: "بازدهٔ فرضی نمی‌تواند کمتر از منفی ۱۰۰ درصد باشد.",
  inflation: "تورم فرضی باید بزرگ‌تر از منفی ۱۰۰ درصد باشد.",
  "numeric-overflow": "اعداد واردشده چنان بزرگ‌اند که نتیجه عددِ معناداری نمی‌شود.",
};

export function scenarioErrorText(code: string): string {
  return ERROR_TEXT[code] ?? `ورودی نامعتبر است (${code}).`;
}

export function scenarioErrorTexts(codes: readonly string[]): string[] {
  return [...new Set(codes.map(scenarioErrorText))];
}
