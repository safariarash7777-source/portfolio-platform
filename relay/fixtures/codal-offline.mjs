// Test-only loader of the actual module. Never reads the host process environment.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { notifyAdmissionRejection } from "../codal-admission-diagnostics.mjs";
import { isBrsLocalDeferral } from '../brsapi-policy.mjs';
import { loadDecisionStatement } from '../codal-statement-source.mjs';

export function loadOfflineCodal({ fetchFixture, environment = {} } = {}) {
  const counts = { network: 0, fixtureTransportCalls: 0, syntheticEnvironmentReads: 0 };
  let source = readFileSync(new URL("../codal.mjs", import.meta.url), "utf8");
  const imports = [
    'import { brsFetch as fetch } from "./brsapi-transport.mjs";',
    'import { isBrsLocalDeferral } from "./brsapi-policy.mjs";',
    'import { notifyAdmissionRejection } from "./codal-admission-diagnostics.mjs";',
    'import { createHash } from "node:crypto";',
    'import { loadDecisionStatement } from "./codal-statement-source.mjs";',
  ];
  for (const line of imports) {
    if (!source.includes(line)) throw new Error("Offline loader import boundary changed");
    source = source.replace(line, "");
  }
  source = source.replace(/^export /gm, "");
  const syntheticProcess = { env: new Proxy({}, { get(_, key) { counts.syntheticEnvironmentReads++; return environment[key]; } }) };
  const fetch = (...args) => {
    if (fetchFixture) { counts.fixtureTransportCalls++; return fetchFixture(...args); }
    counts.network++; throw new Error("Offline parser network denied");
  };
  const instantiate = vm.runInThisContext(`(function(fetch,notifyAdmissionRejection,process,console,createHash,isBrsLocalDeferral,loadDecisionStatement){\n${source}\nreturn {parseHtmlTables,normalizeN10,normalizeN10Bank,normalizeN30,unitFromHeader,unitFromArithmetic,resolveAmountUnit,PARSER_VERSION,metaFrom,downloadAndParse,insertParsedReport};\n})`, { filename: "actual-codal-offline.mjs" });
  const offlineStatement = (announcement, meta) => loadDecisionStatement(announcement, meta, { fetchImpl: fetch });
  return { parser: instantiate(fetch, notifyAdmissionRejection, syntheticProcess, console, createHash, isBrsLocalDeferral, offlineStatement), counts };
}

export function foladQuantityFixture() {
  const bytes = readFileSync(new URL("./folad-n30-primary.html", import.meta.url));
  const htmlSha256 = createHash("sha256").update(bytes).digest("hex");
  if (htmlSha256 !== "11c089fae22de79e4986b37677e3ce2af3f594642cff0f546b2bc0feb84c2a62") throw new Error("Primary N30 fixture bytes changed");
  const { parser, counts } = loadOfflineCodal();
  const origin = { version: 1, sourceId: "https://excel.codal.ir/service/Excel/GetAll/UF9BctCE5jV6HYNuyA8yYA%3d%3d/0", htmlSha256, symbol: "فولاد", periodEnd: "1405-06-31" };
  const tables = parser.parseHtmlTables(bytes.toString("utf8"));
  const meta = { symbol: origin.symbol, period_end: origin.periodEnd, quantity_source: { ...origin, htmlBytes: bytes } };
  return { parser, counts, origin, tables, meta, report: parser.normalizeN30(tables, meta), bytes };
}
