import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  MONTHLY_PERIOD_REPAIR_VERSION, isIndustrialMonthlyWorkbook, buildParsedReportRow,
  metaFromAnnouncement, readIndustrialMonthlyDecision, jalaliYmdToGregorian,
} from "../../relay/codal.mjs";

// List an exported operational screener response, or verify one explicitly
// selected ID against a fresh public read of the stored immutable report.
// Neither mode writes to the database. Verification reads only that Codal
// announcement through the collector's existing publisher parser.
export function candidates(screen) {
  if (!Array.isArray(screen.rows) || !screen.checkedAt || !screen.previousPeriod || !screen.period) {
    throw new Error("Expected a complete monthly screener response");
  }
  const result = [];
  const seen = new Set();
  for (const row of screen.rows) {
    for (const item of row.unitReview ?? []) {
      if (!row.eligible || item.symbol !== row.symbol || !Number.isSafeInteger(item.reportId) ||
          ![screen.period, screen.previousPeriod].includes(item.periodEnd?.slice(0, 7)) ||
          seen.has(item.reportId)) throw new Error("Invalid candidate identity");
      seen.add(item.reportId);
      result.push(item);
    }
  }
  return result;
}

function baseLink(value) {
  const url = new URL(value);
  if (url.hash && !/^#pv\d+$/.test(url.hash)) throw new Error("Unknown report version");
  url.hash = "";
  return url.href;
}
function canonical(value) {
  return String(value ?? "").trim().normalize("NFC").replace(/[يى]/g, "ی").replace(/ك/g, "ک");
}
export async function verifyCandidate(item, row) {
  if (!row || row.id !== item.reportId || canonical(row.symbol) !== item.symbol ||
      canonical(row.data?.symbol) !== item.symbol || row.report_kind !== "ن-۳۰" ||
      row.data?.period_end !== item.periodEnd || row.data.unit?.trim() ||
      !Number.isSafeInteger(row.data?.period_total_amount) || row.data.period_total_amount < 0 ||
      (row.data.monthly_measure && row.data.monthly_measure !== "sales") ||
      (row.raw?.parser_version ?? 1) >= MONTHLY_PERIOD_REPAIR_VERSION ||
      baseLink(row.source_url) !== item.sourceUrl ||
      /اصلاحیه/.test(canonical(row.title)) !== item.amendment) throw new Error("Stored report no longer matches candidate");
  const a = { l18: row.symbol, l30: row.company_name, link: item.sourceUrl, link_excel: row.raw?.link_excel,
    link_pdf: row.raw?.link_pdf, title: row.title, code: row.report_kind,
    date_publish: row.raw?.date_publish, time_publish: row.raw?.time_publish };
  const meta = metaFromAnnouncement(a, "ن-۳۰");
  if (!isIndustrialMonthlyWorkbook(a) || meta.period_end !== item.periodEnd || meta.period_months !== 1 ||
      row.period_end !== jalaliYmdToGregorian(...item.periodEnd.split("-").map(Number))) throw new Error("Inconsistent scope or period");
  const data = await readIndustrialMonthlyDecision(a);
  if (!data || canonical(data.symbol) !== item.symbol || data.period_end !== item.periodEnd ||
      data.unit !== "میلیون ریال" || data.period_total_amount !== row.data.period_total_amount ||
      data.monthly_source?.sheet_code !== 1000000 || data.monthly_source?.table_code !== 1197 ||
      !/^[a-f0-9]{64}$/.test(data.monthly_source?.sha256) ||
      !Number.isSafeInteger(data.monthly_source?.tracing_no) || data.monthly_source.tracing_no < 1) {
    throw new Error("Official document did not verify the stored period, amount and unit");
  }
  const append = buildParsedReportRow(a, "ن-۳۰", data);
  if (append.source_url !== item.sourceUrl + "#pv" + MONTHLY_PERIOD_REPAIR_VERSION ||
      append.source_url === row.source_url) throw new Error("Cannot preserve original report version");
  return { status: "verified_dry_run", preservedReportId: row.id, symbol: item.symbol,
    period: item.periodEnd, amendment: item.amendment, amount: data.period_total_amount, unit: data.unit,
    sourceUrl: item.sourceUrl, evidence: data.monthly_source, proposedSourceUrl: append.source_url, append };
}

async function cli([mode,screenPath,id,storedPath,...extra]) {
  if (mode !== "verify-one") { extra = [id,storedPath,...extra].filter(x => x !== undefined); }
  if (!screenPath || extra.length || !["list","verify-one"].includes(mode) ||
      (mode === "verify-one" && (!/^\d+$/.test(id) || !storedPath))) throw new Error("Use list SCREEN.json or verify-one SCREEN.json ID STORED-ROW.json");
  const list = candidates(JSON.parse(await readFile(screenPath, "utf8")));
  if (mode === "list") return {status:"candidates_only",count:list.length,candidates:list};
  const item = list.find(r=>r.reportId===Number(id));
  if (!item) throw new Error("This report is not a canonical unit-review candidate");
  return verifyCandidate(item, JSON.parse(await readFile(storedPath, "utf8")));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).then(r => console.log(JSON.stringify(r)), err => {
    console.error(err.message); process.exitCode=1;
  });
}
