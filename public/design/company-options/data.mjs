// One immutable educational record for both structures. No real company/report is asserted.
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export const DATA = freeze({
  datasetId: 'P14-EDU-01',
  company: 'شرکت نمونهٔ صنعتی',
  symbol: 'نمونه',
  sector: 'فعالیت صنعتی · مثال آموزشی',
  source: {
    label: 'دادهٔ آموزشی تألیفی برای مقایسهٔ دو طرح',
    sampleDocumentId: 'EDU-N30-01',
    createdOn: '2026-10-30',
    officialReportId: null,
    officialUrl: null,
    publishedAt: null,
    collectedAt: null,
    revision: null,
  },
  period: '1405-06-31',
  periodDefinition: 'فعالیت یک‌ماههٔ شهریور · مثال آموزشی',
  amountUnit: 'میلیون ریال',
  quantityUnit: 'تن',
  rows: [
    { key: 'sales', label: 'مبلغ فروش ماه', value: 120000, unit: 'میلیون ریال', reason: null },
    { key: 'quantity', label: 'مقدار فروش ماه', value: 4200, unit: 'تن', reason: null },
    { key: 'production', label: 'مقدار تولید ماه', value: 4400, unit: 'تن', reason: null },
    { key: 'cost', label: 'بهای تمام‌شده', value: null, unit: 'میلیون ریال', reason: 'در دادهٔ آموزشی تعریف نشده است.' },
    { key: 'profit', label: 'سود خالص', value: null, unit: 'میلیون ریال', reason: 'از گزارش فروش ماهانه به‌تنهایی نتیجه نمی‌شود.' },
    { key: 'margin', label: 'حاشیهٔ سود', value: null, unit: 'درصد', reason: 'بدون هزینه و سود معتبر محاسبه نمی‌شود.' },
  ],
  months: [
    { period: '1405-03', label: 'خرداد', sales: 96000 },
    { period: '1405-04', label: 'تیر', sales: 100000 },
    { period: '1405-05', label: 'مرداد', sales: 108000 },
    { period: '1405-06', label: 'شهریور', sales: 120000 },
  ],
});
export const DATA_JSON = JSON.stringify(DATA);
