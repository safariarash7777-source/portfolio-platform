import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toMarket } from "../../lib/market-ir";
import { iranReadQuality, withValidNav } from "../../lib/market-quality";
import OptionsBoard from "../../components/market/OptionsBoard";
import { GET } from "../../app/api/codal-list/route";

Object.assign(globalThis, { React });
async function main() {
  const [privateDirectory, evidenceDirectory, outputPath] = process.argv.slice(2);
  assert.ok(privateDirectory && evidenceDirectory && outputPath);
  const families = ["stocks", "funds", "options", "gold", "currency", "crypto"] as const;
  const payload: Record<string, unknown> = { fetchedAt: null };
  for (const family of families) {
    const captured = JSON.parse(readFileSync(join(privateDirectory, `family-first-${family}.private.json`), "utf8"));
    assert.equal(captured.length, 1);
    assert.ok(captured[0].row);
    payload[family] = [captured[0].row];
  }
  const market = toMarket(payload);
  const quality = iranReadQuality(market);
  const fund = withValidNav(market.funds[0], null, Date.now());
  const html = renderToStaticMarkup(React.createElement(OptionsBoard, { options: market.options, fetchedAt: null, availability: quality.families.options }));
  const feed = JSON.parse(readFileSync(join(evidenceDirectory, "small-latest-codal-feed.public.json"), "utf8")).metadata;
  const previous = { fetch: globalThis.fetch, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://offline-proof.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "offline-placeholder";
  let requests = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "offline-proof.invalid");
    assert.equal(url.pathname, "/rest/v1/codal_feed");
    requests++;
    return Response.json(feed);
  };
  let response;
  try {
    response = await GET(new Request("https://offline-proof.invalid/api/codal-list?symbol=" + encodeURIComponent(feed[0].symbol)));
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
  }
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].date, feed[0].sent_date);
  assert.equal(fund.bubblePercent, null);
  assert.equal(market.options[0].priceUnit, null);
  assert.ok(html.includes("واحد نامعلوم"));
  const result = {
    observedAt: new Date().toISOString(), proof: "offline actual consumers with freshly captured DB samples",
    deployedUiAcceptance: false, runtimeInstalled: false, networkRequests: 0, providerRequests: 0,
    receiptClock: "not projected; left null rather than inferred from updated_at", sampleSizePerFamily: 1,
    families: Object.fromEntries(families.map(f => [f, { rows: market[f].length, state: quality.families[f].state }])),
    fund: { id: fund.id, positiveRawNav: market.funds[0].nav != null && market.funds[0].nav > 0, acceptedBubble: fund.bubblePercent != null, navState: fund.navState, reason: fund.navReason },
    option: { id: market.options[0].id, priceUnit: market.options[0].priceUnit, valueUnit: market.options[0].valueUnit, contractSizeKnown: market.options[0].contractSize != null, actualBoardUnknownUnitLabels: (html.match(/واحد نامعلوم/g) ?? []).length },
    codal: { symbol: feed[0].symbol, announcementId: feed[0].id, routeHttpStatus: response.status, routeRows: body.data.length, source: body.source, coverage: body.coverage, dateKind: body.data[0].dateKind, stubbedDatabaseReads: requests },
  };
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error("proof failed; no raw rows or values emitted"); process.exitCode = 1; });
