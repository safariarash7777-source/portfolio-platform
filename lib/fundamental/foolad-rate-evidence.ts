// Exact P5 cells independently transcribed from the two official workbooks in
// outputs/company-consultation-delivery/evidence/official-foolad-hot-yoy.json.
// They certify these two published rows, not the denominator of a stored rate
// on any other issuer, product, period, or revision.
export const FOOLAD_HOT_DOMESTIC_KEY = JSON.stringify(["محصولات گرم", "داخلی"]);
export const FOOLAD_HOT_DOMESTIC_RATES = [
  {
    id: 13719, period: "1405-07-30", quantity: 267, amount: 258085416,
    rate: 966612044944,
    source: "https://codal.ir/Reports/Decision.aspx?LetterSerial=LyQnlYP7OOObOOOIDLto8TGJDkDQ%3d%3d&rt=0&let=58&ct=0&ft=-1",
    workbook: "https://excel.codal.ir/service/Excel/GetAll/LyQnlYP7OOObOOOIDLto8TGJDkDQ%3d%3d/0",
    sha256: "717b8d5b0d71b6a8666bef4ff45c5be2af51a41621e8016b5615e690ccfc5329",
  },
  {
    id: 93, period: "1404-07-30", quantity: 262, amount: 99450950,
    rate: 379583778626,
    source: "https://codal.ir/Reports/Decision.aspx?LetterSerial=5nKO45yY4Zr5NLhxicMKgA%3d%3d&rt=0&let=58&ct=0&ft=-1",
    workbook: "https://excel.codal.ir/service/Excel/GetAll/5nKO45yY4Zr5NLhxicMKgA%3d%3d/0",
    sha256: "2fa968d278c7c8f6c895f72d91c55b1f10d48a8f14765c48db741221ca2340c5",
  },
] as const;
