import { createHash } from 'node:crypto';

// Pure, bounded interpretation of captured public report bytes. No fetch, JS
// execution, persistence, fixture IDs or activation. The caller must still bind
// this metadata to one real Excel context and pass all existing financial gates.
const MAX_DECISION = 2 * 1024 * 1024;
const MAX_EXCEL = 8 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = reason => { throw new Error(reason); };

/** Native JSON grammar plus a duplicate-key walk (including escaped keys).
 * Existing capitalization JSON deliberately uses last-key-wins and is not a
 * suitable parser for ownership evidence. Never evaluate an object expression. */
function uniqueJson(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('json_invalid'); }
  let i = 0, tokens = 0;
  const space = () => { while (/\s/.test(text[i] ?? '') && i < text.length) i++; };
  const string = () => {
    const start = i++;
    while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; }
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const value = depth => {
    if (depth > 64 || ++tokens > 200000) fail('json_limit');
    space();
    if (text[i] === '{') {
      i++; space(); const keys = new Set();
      while (text[i] !== '}') {
        const key = string();
        if (keys.has(key)) fail('duplicate_json_key');
        keys.add(key); space(); i++; value(depth + 1); space();
        if (text[i] === ',') { i++; space(); } else break;
      }
      i++;
    } else if (text[i] === '[') {
      i++; space();
      while (text[i] !== ']') {
        value(depth + 1); space();
        if (text[i] === ',') { i++; space(); } else break;
      }
      i++;
    } else if (text[i] === '"') string();
    else { while (i < text.length && !/[\s,}\]]/.test(text[i])) i++; }
  };
  value(0);
  return parsed;
}

// Find a top-level var datasource = JSON at the end of one inline script.
// Quoted strings and comments cannot create a declaration. Braces inside JSON
// strings are skipped. Publisher code is only text, never imported or evaluated.
function literalDatasource(html) {
  const found = [];
  for (const match of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(match[1])) continue;
    const script = match[2];
    let depth = 0;
    for (let i = 0; i < script.length;) {
      const c = script[i];
      if (c === '"' || c === "'" || c === '`') {
        i++; while (i < script.length && script[i] !== c) { if (script[i] === '\\') i++; i++; } i++; continue;
      }
      if (script.slice(i, i + 2) === '//') { i = script.indexOf('\n', i); if (i < 0) break; continue; }
      if (script.slice(i, i + 2) === '/*') { i = script.indexOf('*/', i + 2); if (i < 0) fail('json_invalid'); i += 2; continue; }
      if (c === '{') depth++;
      if (c === '}') depth--;
      if (/[\w$]/.test(c)) {
        const token = /^[\w$]+/.exec(script.slice(i))[0];
        if (token === 'var' && depth === 0) {
          const declaration = /^var\s+datasource\s*=\s*/.exec(script.slice(i));
          if (declaration) {
            const tail = script.slice(i + declaration[0].length).trim();
            if (!tail.endsWith(';')) fail('json_invalid');
            found.push(uniqueJson(tail.slice(0, -1)));
            break;
          }
        }
        i += token.length;
      } else i++;
    }
  }
  if (found.length !== 1) fail('datasource_ambiguous');
  return found[0];
}

function attributes(opening) {
  return [...opening.matchAll(/\s+([a-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi)]
    .map(m => ({name:m[1].toLowerCase(),value:m[2] ?? m[3] ?? m[4] ?? null}));
}
function attr(opening, name) {
  const matches = attributes(opening).filter(a => a.name === name);
  if (matches.length !== 1) fail('header_ambiguous');
  return matches[0].value;
}
function element(html, tag, id) {
  const matches = [...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>[\\s\\S]*?<\\/'+tag+'\\s*>', 'gi'))]
    .filter(m => attributes(m[0].slice(0, m[0].indexOf('>') + 1)).some(a=>a.name==='id' && a.value===id));
  if (matches.length !== 1) fail('header_ambiguous');
  const opening = matches[0][0].slice(0, matches[0][0].indexOf('>') + 1);
  if (attr(opening, 'id') !== id || /\bhidden\b|display\s*:\s*none|visibility\s*:\s*hidden/i.test(opening)) fail('header_invalid');
  return matches[0][0];
}
function sourceText(source, limit) {
  if (!source || !(source.htmlBytes instanceof Uint8Array) || source.htmlBytes.byteLength > limit ||
      !source.htmlBytes.byteLength || typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256) || hash(source.htmlBytes) !== source.sha256) fail('source_hash_mismatch');
  const bytes = Buffer.from(source.htmlBytes);
  const text = bytes.toString('utf8');
  if (!bytes.equals(Buffer.from(text, 'utf8'))) fail('source_encoding');
  return text;
}
function reportSerial(url, decision) {
  if (typeof url !== 'string' || url.trim() !== url) fail('source_identity');
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.port ||
      u.hostname !== (decision ? 'codal.ir' : 'excel.codal.ir')) fail('source_identity');
  if (decision) {
    if (u.pathname !== '/Reports/Decision.aspx') fail('source_identity');
    const pairs = u.search.slice(1).split('&').map(p => p.split('='));
    const serials = pairs.filter(p => p[0] === 'LetterSerial');
    if (serials.length !== 1 || serials[0].length !== 2) fail('source_identity');
    return decodeURIComponent(serials[0][1]); // Do NOT apply URLSearchParams plus-to-space semantics.
  }
  if (u.search) fail('source_identity');
  const match = /^\/service\/Excel\/GetAll\/([^/]+)\/0$/.exec(u.pathname);
  if (!match) fail('source_identity');
  return decodeURIComponent(match[1]);
}

/** @typedef {{url:string, htmlBytes:Uint8Array, sha256:string}} CapturedReportSource */
/** @typedef {{decision:CapturedReportSource, excel:CapturedReportSource,
 * announcement:{link:string,link_excel:string}}} ReportMetadataSources */

/** Internal source reader, reused by the existing N10 context resolver. Helpers
 * are the existing parser's text/label/calendar functions, not caller evidence.
 * @param {ReportMetadataSources} sources */
export function readN10ReportMetadata(sources, excelHtml, meta, { text, norm, date }) {
  try {
    if (sources?.announcement?.link !== sources?.decision?.url || sources?.announcement?.link_excel !== sources?.excel?.url) fail('source_identity');
    const serial = reportSerial(sources.decision.url, true);
    if (!serial || serial !== reportSerial(sources.excel.url, false)) fail('source_identity');
    const decisionHtml = sourceText(sources.decision, MAX_DECISION);
    if (sourceText(sources.excel, MAX_EXCEL) !== excelHtml) fail('source_identity');
    const root = literalDatasource(decisionHtml);
    if (!root || typeof root !== 'object' || root.isConsolidated !== false || typeof root.isAudited !== 'boolean' ||
        !Number.isSafeInteger(root.period) || ![3,6,9,12].includes(root.period) || root.periodExtraDay !== 0 ||
        !Number.isSafeInteger(root.tracingNo) || root.tracingNo <= 0) fail('metadata_type_or_scope');
    if ((root.calendar !== undefined && root.calendar !== 'jalali') || (meta.calendar !== undefined && meta.calendar !== 'jalali') ||
        (root.periodKind !== undefined && root.periodKind !== 'cumulative') || (meta.periodKind !== undefined && meta.periodKind !== 'cumulative') ||
        /تلفیقی/.test(norm(root.title_Fa).replace(/غیرتلفیقی/g,''))) fail('metadata_type_or_scope');
    const end = date(root.periodEndToDate), yearEnd = date(root.yearEndToDate);
    if (!end || !yearEnd || end > yearEnd || end !== meta.period_end || root.period !== meta.period_months || root.isAudited !== meta.audited) fail('period_mismatch');
    const visible = decisionHtml.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const get = id => text(element(visible, 'span', id));
    const titles = [...visible.matchAll(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi)];
    const title = titles.length === 1 ? text(titles[0][0]) : '';
    const months = value => [...norm(value).matchAll(/(\d{1,2})ماهه/g)].map(m => +m[1]);
    const dates = value => [...value.matchAll(/1[34]\d{2}[/-]\d{2}[/-]\d{2}/g)].map(m => date(m[0]));
    if (months(title).length !== 1 || months(title)[0] !== root.period || dates(title).length !== 1 || dates(title)[0] !== end ||
        !norm(title).includes('صورتهایمالی') || norm(title).includes('تلفیقی') ||
        months(get('ctl00_lblPeriod')).length !== 1 || months(get('ctl00_lblPeriod'))[0] !== root.period ||
        date(get('ctl00_lblPeriodEndToDate')) !== end || date(get('ctl00_lblYearEndToDate')) !== yearEnd ||
        norm(get('ctl00_txbSymbol')) !== norm(meta.symbol) || !norm(meta.symbol) ||
        norm(get('ctl00_txbCompanyName')) !== norm(meta.company_name) || !norm(meta.company_name) ||
        norm(get('ctl00_lblIsAudited')) !== norm(root.isAudited ? 'حسابرسی شده' : 'حسابرسی نشده')) fail('report_header_conflict');
    const inputs = [...visible.matchAll(/<input\b[^>]*>/gi)].filter(m => attributes(m[0]).some(a=>a.name==='id' && a.value==='ctl00_cphBody_ucDynamicFinancialStatement_hdfLetterRef'));
    if (inputs.length !== 1 || attr(inputs[0][0], 'value') !== serial) fail('source_identity');
    const select = element(visible, 'select', 'ddlTable');
    const options = [...select.matchAll(/<option\b[^>]*>/gi)].filter(m => attributes(m[0]).some(a=>a.name==='selected'));
    if (options.length !== 1) fail('sheet_ambiguous');
    const selected = attr(options[0][0], 'value');
    if (!/^\d+$/.test(selected) || !Array.isArray(root.sheets) || root.sheets.length !== 1) fail('sheet_ambiguous');
    const sheet = root.sheets[0];
    if (!Number.isSafeInteger(sheet.code) || String(sheet.code) !== selected || !Array.isArray(sheet.tables)) fail('sheet_ambiguous');
    const codes = new Set(), ids = new Set();
    for (const t of sheet.tables) {
      if (!t || !Number.isSafeInteger(t.code) || !Number.isSafeInteger(t.metaTableId) || t.sheetCode !== sheet.code || codes.has(t.code) || ids.has(t.metaTableId)) fail('table_ambiguous');
      codes.add(t.code); ids.add(t.metaTableId);
    }
    const incomes = sheet.tables.filter(t => t.aliasName === 'IncomeStatement');
    if (incomes.length !== 1) fail('table_ambiguous');
    const table = incomes[0];
    if (!Array.isArray(table.cells) || !norm(table.title_Fa).startsWith('صورتسودوزیان')) fail('table_identity');
    for (const owner of [sheet,table]) {
      if ((owner.isConsolidated !== undefined && owner.isConsolidated !== false) ||
          /تلفیقی/.test(norm(owner.title_Fa).replace(/غیرتلفیقی/g,''))) fail('metadata_type_or_scope');
      if ((owner.period !== undefined && owner.period !== root.period) ||
          (owner.periodEndToDate !== undefined && date(owner.periodEndToDate) !== end)) fail('period_mismatch');
    }
    const addresses = new Set(), coordinates = new Set();
    for (const cell of table.cells) {
      if (!cell || typeof cell.address !== 'string' || !/^[A-Z]+[1-9]\d*$/.test(cell.address) ||
          !Number.isSafeInteger(cell.rowSequence) || cell.rowSequence < 1 || !Number.isSafeInteger(cell.columnSequence) || cell.columnSequence < 1 ||
          cell.metaTableId !== table.metaTableId || cell.metaTableCode !== table.code || typeof cell.isVisible !== 'boolean' ||
          addresses.has(cell.address) || coordinates.has(`${cell.rowSequence}:${cell.columnSequence}`)) fail('cell_identity');
      const coordinate = /^([A-Z]+)(\d+)$/.exec(cell.address);
      const column = [...coordinate[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
      if (column !== cell.columnSequence || +coordinate[2] !== cell.rowSequence) fail('cell_identity');
      addresses.add(cell.address); coordinates.add(`${cell.rowSequence}:${cell.columnSequence}`);
    }
    const headers = ['B1','B2'].map(address => table.cells.find(c => c.address === address));
    if (headers.some((c,i) => !c || c.columnSequence !== 2 || c.rowSequence !== i+1 || c.cellGroupName !== 'Header' ||
        !c.isVisible || c.colSpan !== 1 || c.rowSpan !== 1 || c.formula !== '' ||
        date(c.periodEndToDate) !== end || date(c.yearEndToDate) !== yearEnd || c.isAudited !== root.isAudited) ||
        dates(headers[0].value).length !== 1 || dates(headers[0].value)[0] !== end ||
        norm(headers[1].value) !== norm(root.isAudited ? 'حسابرسی شده' : 'حسابرسی نشده')) fail('column_identity');
    return { ok:true, root, sheet, table, end, yearEnd,
      source: {decisionSha256:sources.decision.sha256,excelSha256:sources.excel.sha256,letterSerial:serial} };
  } catch (error) {
    const reasons = ['json_invalid','json_limit','duplicate_json_key','datasource_ambiguous','header_ambiguous','header_invalid',
      'source_hash_mismatch','source_encoding','source_identity','metadata_type_or_scope','period_mismatch','report_header_conflict',
      'sheet_ambiguous','table_ambiguous','table_identity','cell_identity','column_identity'];
    return {ok:false, reason:reasons.includes(error?.message) ? error.message : 'metadata_invalid'};
  }
}
