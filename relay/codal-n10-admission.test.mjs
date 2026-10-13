import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as codal from "./codal.mjs";
import { meta, industrial, bank, container } from "./fixtures/n10-admission-fixtures.mjs";
// Baseline uses the real former admission path, not a fabricated implementation.
const admit = (html, m = meta) => codal.admitN10Html
  ? codal.admitN10Html(html, m)
  : codal.normalizeN10(codal.parseHtmlTables(html), m);
const fixture = readFileSync(new URL("./fixtures/vanovin-n10-fy1404.html", import.meta.url), "utf8");
const withHeader = (html, declaration, selectedTable = 0) => {
  let index = 0;
  return html.replace(/<table>/g, tag => index++ === selectedTable ? `${tag}<tr><td>${declaration}</td></tr>` : tag);
};
const withEquityHeading = (html, declaration) => html.replace("<td>سرمایه</td>", `<td>سرمایه</td><td>${declaration}</td>`);

test("extractor retains exact local title, adjacent description and container span", () => {
  assert.equal(typeof codal.extractN10Tables, "function");
  const contexts = codal.extractN10Tables(fixture);
  const inc = contexts.find(t => t.localTitle === "صورت سود و زیان");
  assert.ok(inc);
  assert.match(inc.localDescription, /میلیون ریال/);
  assert.ok(Number.isInteger(inc.index));
  assert.ok(inc.rows.length > 20);
  const local = fixture.slice(inc.span.start, inc.span.end);
  assert.match(local, /table-containet/);
  assert.match(local, /table-description/);
  assert.equal(codal.parseHtmlTables(local).length, 1);
});

test("real Vanovin generic title cannot certify standalone scope", () => {
  assert.equal(admit(fixture, { ...meta, symbol: "ونوین", period_end: "1404-12-29", period_months: 12 }), null);
});

test("context-qualified Vanovin preserves its former finite observed output", () => {
  const qualified = fixture.replace('class="table-title ng-binding ng-scope">صورت سود و زیان',
    'class="table-title ng-binding ng-scope">صورت سود و زیان جداگانه شرکت اصلی - دوره 12 ماهه منتهی به 1404/12/29');
  const m = { ...meta, symbol: "ونوین", period_end: "1404-12-29", period_months: 12 };
  assert.deepEqual(admit(qualified, m), codal.normalizeN10(codal.parseHtmlTables(fixture), m));
});

test("industrial valid admission does not reinterpret the legacy output", () => {
  const html = industrial();
  assert.deepEqual(admit(html), codal.normalizeN10(codal.parseHtmlTables(html), meta));
  assert.equal(admit(html).unit, "میلیون ریال");
  assert.equal(codal.PARSER_VERSION, 2);
});

test("unit elsewhere in the workbook cannot rescue the income statement", () => {
  const unrelated = container([["ارقام به میلیون ریال", "10"]], "اطلاعات تجهیزات");
  assert.equal(admit(unrelated + industrial({ unit: "" })), null);
  assert.equal(admit(industrial({ unit: "مبالغ به هزار ریال" })), null);
  assert.equal(admit(industrial({ unit: "مبالغ به ریال" })), null);
});

test("conflicting local units reject but unrelated units do not contaminate admission", () => {
  assert.equal(admit(industrial({ unit: "ارقام به میلیون ریال و هزار ریال" })), null);
  const unrelated = container([["شرح", "5"]], "تجهیزات", "مبالغ به هزار ریال");
  assert.deepEqual(admit(unrelated + industrial()), admit(industrial()));
});

test("amount unit declarations in the selected table headers must agree", async t => {
  for (const declaration of ["ارقام به هزار ریال", "ارقام به ریال", "ارقام به میلیون تومان",
    "ارقام به میلیون ریال و هزار ریال", "ارقام به هزار ریال؛ سود هر سهم (ریال)"]) {
    await t.test(declaration, () => assert.equal(admit(withHeader(industrial(), declaration)), null));
  }
  const priorConflict = industrial().replace("دوره 3 ماهه منتهی به 1403/03/31", "دوره 3 ماهه منتهی به 1403/03/31 (هزار ریال)");
  await t.test("prior amount column", () => assert.equal(admit(priorConflict), null));
});

test("matching amount headers and explicit EPS units keep their separate dimensions", async t => {
  const expected = admit(industrial());
  assert.ok(expected);
  for (const declaration of ["ارقام به میلیون ریال", "سود هر سهم (ریال)", "ریال/سهم",
    "ارقام به میلیون ریال؛ سود هر سهم (ریال)"]) {
    await t.test(declaration, () => assert.deepEqual(admit(withHeader(industrial(), declaration)), expected));
  }
});

test("equity table header units cannot contradict their own local amount description", () => {
  assert.equal(admit(withEquityHeading(industrial(), "ارقام به هزار ریال")), null);
});

test("selected income and equity header scope cannot contradict standalone context", async t => {
  for (const declaration of ["تلفیقی", "صورت سود و زیان تلفیقی"]) {
    await t.test(`income: ${declaration}`, () => assert.equal(admit(withHeader(industrial(), declaration)), null));
  }
  for (const declaration of ["تلفیقی", "صورت تغییرات حقوق مالکانه تلفیقی"]) {
    await t.test(`equity: ${declaration}`, () => assert.equal(admit(withEquityHeading(industrial(), declaration)), null));
  }
});

test("repeated capital columns reject even when both observed balances agree", async t => {
  for (const other of [500, 600]) {
    const html = industrial().replace("<td>سرمایه</td>", "<td>سرمایه</td><td>سرمایه</td>")
      .replace("<td>500</td>", `<td>500</td><td>${other}</td>`);
    await t.test(`second capital column: ${other}`, () => assert.equal(admit(html), null));
  }
});

test("independent from inflation is not an explicit standalone statement scope", async t => {
  await t.test("income", () => assert.equal(admit(industrial({ scope: "مستقل از تورم" })), null));
  await t.test("equity", () => assert.equal(admit(industrial({ capitalScope: "مستقل از تورم" })), null));
});

test("unknown, consolidated, conflicting and subsidiary scope reject", () => {
  for (const scope of ["", "تلفیقی", "تلفیقی و جداگانه", "جداگانه شرکت زیرمجموعه"]) {
    assert.equal(admit(industrial({ scope })), null, scope);
  }
});

test("consolidated before standalone cannot select the consolidated numbers", () => {
  const consolidated = industrial({ scope: "تلفیقی", current: [200, "(120)", 80, 60, 40], before: [160, "(100)", 60, 40, 20] });
  assert.deepEqual(admit(consolidated + industrial()), admit(industrial()));
});

test("two eligible standalone income tables are ambiguous", () => {
  assert.equal(admit(industrial() + industrial()), null);
});

test("every mandatory current amount must be finite and observed", () => {
  for (let i = 0; i < 5; i++) {
    for (const missing of ["", "-", "--", "9".repeat(400)]) {
      const current = [100, "(60)", 40, 30, 20]; current[i] = missing;
      assert.equal(admit(industrial({ current })), null, `${i}: ${missing.slice(0, 5)}`);
    }
  }
});

test("explicit current zeros and industrial EPS zero stay zero", () => {
  const d = admit(industrial({ current: [0, "0", 0, 0, 0], eps: 0, prior: false }));
  assert.ok(d);
  for (const key of ["revenue", "cogs", "gross_profit", "operating_profit", "net_profit", "eps_rial"]) assert.equal(d.standalone[key], 0);
});

test("current/prior dates and month counts must be clear and match", () => {
  assert.equal(admit(industrial({ period: "1404/06/31" })), null);
  assert.equal(admit(industrial().replace("دوره 3 ماهه", "دوره 6 ماهه")), null);
  assert.equal(admit(industrial().replace("دوره 3 ماهه منتهی به 1404/03/31", "دوره جاری")), null);
  assert.equal(admit(industrial().replace("دوره 3 ماهه منتهی به 1403/03/31", "دوره قبل")), null);
  assert.equal(admit(industrial().replace("دوره 3 ماهه منتهی به 1403/03/31", "دوره 6 ماهه منتهی به 1403/03/31")), null);
  assert.equal(admit(industrial().replace("دوره 3 ماهه منتهی به 1403/03/31", "تجدید ارائه شده 1403/03/31")), null);
});

test("prior incomplete rejects, truly absent prior is omitted", () => {
  for (let i = 0; i < 5; i++) {
    const before = [80, "(50)", 30, 20, 10]; before[i] = "";
    assert.equal(admit(industrial({ before })), null);
  }
  assert.equal(admit(industrial({ before: ["", "", "", "", ""] })), null);
  const d = admit(industrial({ prior: false }));
  assert.ok(d); assert.equal("prior" in d.standalone, false);
});

test("prior arithmetic is validated without deriving replacement values", () => {
  assert.equal(admit(industrial({ before: [80, "(50)", 99, 20, 10] })), null);
});

test("capital needs positive evidence in the same scope, unit and period", () => {
  for (const options of [
    { capital: false }, { capital: "" }, { capital: 0 }, { capital: -1 },
    { capitalScope: "تلفیقی" }, { capitalScope: "" }, { capitalUnit: "مبالغ به ریال" },
    { capitalPeriod: "1403/03/31" },
  ]) assert.equal(admit(industrial(options)), null, JSON.stringify(options));
});

test("bank valid values, capital and prior EPS zero keep legacy interpretation", () => {
  const html = bank({ priorEps: 0 });
  const d = admit(html);
  assert.deepEqual(d, codal.normalizeN10Bank(codal.parseHtmlTables(html), meta));
  assert.equal(d.standalone.prior.eps_rial, 0);
  assert.equal(d.capital, 500);
});

test("bank current EPS zero requiring legacy semantic correction is rejected under pv2", () => {
  assert.equal(admit(bank({ eps: 0 })), null);
});

test("EPS must have an observed rial/share denominator and finite value", () => {
  assert.equal(admit(industrial().replace("هر سهم – ریال", "هر سهم – هزار ریال")), null);
  assert.equal(admit(industrial({ eps: "9".repeat(400) })), null);
  const d = admit(industrial({ eps: false }));
  assert.ok(d); assert.equal("eps_rial" in d.standalone, false);
});

test("unscoped ancestor or neighboring title is never borrowed", () => {
  const raw = codal.parseHtmlTables(industrial())[0];
  const html = `<div><h3>صورت سود و زیان جداگانه شرکت اصلی</h3><p>ارقام به میلیون ریال</p>${container(raw, "صورت سود و زیان", "")}</div>`;
  assert.equal(admit(html), null);
});

test("N30 and the legacy table-only API remain identical", () => {
  const html = industrial();
  const raw = codal.parseHtmlTables(html);
  assert.ok(Array.isArray(raw[0][0]));
  assert.equal(codal.normalizeN30(raw, meta), null);
});

test("merged, missing or shifted column geometry is rejected", () => {
  assert.equal(admit(industrial().replace("<td>100</td>", '<td colspan="2">100</td>')), null);
  assert.equal(admit(industrial().replace("<td>100</td>", '<td colspan="0">100</td>')), null);
  assert.equal(admit(industrial().replace("<td>100</td>", '<td rowspan="2">100</td>')), null);
});

test("title and description inside the table are not adjacent container context", () => {
  const html = industrial();
  const misleading = html.replace('<div class="table-description">ارقام به میلیون ریال</div>', "")
    .replace("<table>", '<table><tr><td><div class="table-description">ارقام به میلیون ریال</div></td></tr>');
  assert.equal(admit(misleading), null);
});

test("script words cannot create scope evidence or numeric observations", () => {
  assert.equal(admit(industrial({ scope: '<script>جداگانه شرکت اصلی</script>' })), null);
  assert.equal(admit(industrial().replace("<table>", "<table><script>const x=1</script>")), null);
});

test("duplicate capital balances and a later unrelated balance reject", () => {
  const duplicate = industrial().replace("<td>مانده در 1404/03/31</td><td>500</td></tr>",
    "<td>مانده در 1404/03/31</td><td>500</td></tr><tr><td>مانده در 1404/03/31</td><td>600</td></tr>");
  assert.equal(admit(duplicate), null);
  const later = industrial().replace("<td>مانده در 1404/03/31</td><td>500</td></tr>",
    "<td>مانده در 1404/03/31</td><td>500</td></tr><tr><td>مانده در 1403/03/31</td><td>600</td></tr>");
  assert.equal(admit(later), null);
});

test("insurance retains observed legacy mapping with local witnesses", () => {
  const html = bank().replace("درآمد تسهیلات اعطایی", "درآمد حق بیمه").replace("هزینه سود سپرده‌ها", "هزینه خسارت و مزایا");
  const d = admit(html);
  assert.deepEqual(d, codal.normalizeN10Bank(codal.parseHtmlTables(html), meta));
  assert.equal(d.statement_type, "insurance");
});

test("a partially reported prior EPS cannot be silently omitted", () => {
  assert.equal(admit(industrial({ priorEps: "" })), null);
});

test("unrelated independence words and negated declarations are not witnesses", () => {
  assert.equal(admit(industrial({ scope: "", unit: "مبالغ به میلیون ریال مستقل از تورم است" })), null);
  assert.equal(admit(industrial({ scope: "مستقل نیست" })), null);
  assert.equal(admit(industrial({ unit: "مبالغ به میلیون ریال نیست" })), null);
});

test("fixed rejection reasons retain the real Vanovin scope and period limitations", () => {
  const m = { ...meta, symbol: "ونوین", period_end: "1404-12-29", period_months: 12 };
  const events = [];
  assert.equal(codal.admitN10Html(fixture, m, event => events.push(event)), null);
  assert.deepEqual(events, [{ kind: "ن-۱۰", reason: "scope_unknown" }]);
  events.length = 0;
  const scopeOnly = fixture.replace('class="table-title ng-binding ng-scope">صورت سود و زیان',
    'class="table-title ng-binding ng-scope">صورت سود و زیان جداگانه شرکت اصلی');
  assert.equal(codal.admitN10Html(scopeOnly, m, event => events.push(event)), null);
  assert.deepEqual(events, [{ kind: "ن-۱۰", reason: "period_unverified" }]);
});

test("fixed rejection reasons describe the first existing N10 guard without report content", async t => {
  const identity = industrial().replace('<td>درآمدهای عملیاتی</td>',
    '<td>درآمدهای عملیاتی یادداشت</td><td>999</td><td>850</td></tr><tr><td>درآمدهای عملیاتی</td>');
  for (const [reason, html, m] of [
    ["context_invalid", industrial().replace('<div class="table-description">ارقام به میلیون ریال</div>', "")],
    ["geometry_ambiguous", industrial().replace("<td>100</td>", '<td colspan="2">100</td>')],
    ["scope_unknown", industrial({ scope: "" })],
    ["scope_unsupported", industrial({ scope: "تلفیقی" })],
    ["statement_ambiguous", industrial() + industrial()],
    ["unit_unverified", industrial({ unit: "ارقام به ریال" })],
    ["values_unobserved", industrial({ current: [100, "", 40, 30, 20] })],
    ["values_unobserved", industrial({ before: [80, "", 30, 20, 10] })],
    ["period_unverified", industrial({ months: 6 })],
    ["arithmetic_mismatch", industrial({ current: [100, "(60)", 99, 30, 20] })],
    ["capital_unverified", industrial({ capital: false })],
    ["normalized_identity_mismatch", identity],
    ["eps_unverified", industrial().replace("هر سهم – ریال", "هر سهم – هزار ریال")],
    ["eps_unverified", bank({ eps: 0 })],
    ["internal_exception", industrial(), { ...meta, get period_end() { throw Error("SYNTHETIC_SECRET https://private.invalid/?token=fixture"); } }],
  ]) {
    await t.test(reason, () => {
      const events = [];
      assert.equal(codal.admitN10Html(html, m ?? meta, event => events.push(event)), null);
      assert.deepEqual(events, [{ kind: "ن-۱۰", reason }]);
    });
  }
});

test("fixed rejection reasons aggregate N30 row guards once per rejected report only", async t => {
  const row = (qty, rate, amount) => { const r = Array(26).fill(""); r[0] = "محصول نمونه"; r[14] = qty; r[15] = rate; r[16] = amount; return r; };
  const layout = rows => [[ ["ارقام به میلیون ریال", "دوره یک ماهه"], ["نام محصول"], ...rows ]];
  for (const [reason, tables] of [
    ["unsupported_layout", []], ["short_rows", layout([["محصول نمونه", "تن"]])],
    ["missing_sales", layout([row("", "", "")])], ["zero_sales_only", layout([row(0, 0, 0)])],
    ["arithmetic_mismatch", layout([row(100, 1000000, 50)])],
    ["mixed_rows", layout([row("", "", ""), row(0, 0, 0)])],
    ["no_product_rows", layout([])],
  ]) await t.test(reason, () => {
    const events = [];
    assert.equal(codal.normalizeN30(tables, meta, event => events.push(event)), null);
    assert.deepEqual(events, [{ kind: "ن-۳۰", reason }]);
  });
  const events = [], tables = layout([row(100, 1000000, 100), row(0, 0, 0)]);
  assert.deepEqual(codal.normalizeN30(tables, meta, event => events.push(event)), codal.normalizeN30(tables, meta));
  assert.deepEqual(events, [], "accepted partial rows retain the existing result and do not record report rejection");
  const conflict = [[ ["ارقام به ریال", "دوره یک ماهه"], ["نام محصول"], row(100, 1000000, 100) ]];
  const conflictData = codal.normalizeN30(conflict, meta, event => events.push(event));
  assert.equal(conflictData.unit, null);
  assert.deepEqual(conflictData, codal.normalizeN30(conflict, meta));
  assert.deepEqual(events, [], "an existing accepted unknown-unit result is not turned into a rejection");
});

test("a failing diagnostic observer cannot change admission outputs", () => {
  const fail = () => { throw Error("SYNTHETIC_SECRET observer"); };
  assert.equal(codal.admitN10Html(industrial({ scope: "" }), meta, fail), null);
  assert.equal(codal.normalizeN30([], meta, fail), null);
  assert.deepEqual(codal.admitN10Html(industrial(), meta, fail), admit(industrial()));
  const events = [];
  assert.deepEqual(codal.admitN10Html(industrial(), meta, event => events.push(event)), admit(industrial()));
  assert.deepEqual(events, []);
});
