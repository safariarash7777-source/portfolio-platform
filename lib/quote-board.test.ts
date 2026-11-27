import assert from "node:assert/strict";
import test from "node:test";
import { buildQuoteBubbles, quoteDirection, quoteGroups } from "./quote-board";
import type { IrRow } from "./market-ir";
const row = (id: string, price: number, unit: IrRow["unit"] = "toman", sourceTime = "16:59"): IrRow =>
  ({ id, faName: id, price, unit, sourceDate: "1405/09/05", sourceTime });
const now = Date.parse("2026-11-26T13:45:00Z");
const gram = row("IR_GOLD_18K", 25_797_800), coin = row("IR_COIN_EMAMI", 264_735_000);
const usd = row("USD", 292_890), spot = row("XAUUSD", 3_628, "usd");
test("aligned price inputs are used for signed, unit-specific backend estimates", () => {
  const out = buildQuoteBubbles([gram, coin, spot], [usd], now);
  assert.equal(out.IR_COIN_EMAMI?.amount, 12_958_791);
  assert.equal(out.IR_GOLD_18K?.basis, "world-spot");
  assert.equal(out.IR_COIN_EMAMI?.quality, "aligned");
});
test("no fabricated bubble for missing, divergent, future or unusably old source values", () => {
  assert.equal(buildQuoteBubbles([gram, coin], [usd], now).IR_GOLD_18K, null);
  assert.equal(buildQuoteBubbles([gram, coin, {...spot, sourceDate: "1405/09/04"}], [usd], now).IR_GOLD_18K, null);
  assert.equal(buildQuoteBubbles([gram, coin, spot], [usd], now - 3600_000).IR_COIN_EMAMI, null);
  assert.equal(buildQuoteBubbles([gram, coin, spot], [usd], now + 96*3600_000).IR_COIN_EMAMI, null);
  assert.equal(buildQuoteBubbles([gram, coin, spot], [usd], now + 24*3600_000).IR_COIN_EMAMI?.quality, "stored");
});
test("directions compare accepted prices; no movement on first read or identical updates", () => {
  assert.deepEqual([quoteDirection(undefined, 10), quoteDirection(10, 10), quoteDirection(10, 15), quoteDirection(15, 10)], [null, null, "up", "down"]);
});
test("groups retain supplied instrument coverage and global units", () => {
  const rows = quoteGroups({ir:{gold:[gram, coin, spot], currency:[usd]}, goldGlobal:[{...spot,id:"pax-gold"}]});
  assert.deepEqual(rows[0].rows.map(q => q.id), [gram.id, coin.id, spot.id, "pax-gold"]);
  assert.equal(rows[0].rows.at(-1)?.unit, "usd");
});
test("only current, non-retained accepted observations qualify to trigger a price animation", async () => {
  const { acceptsQuoteTick } = await import("./quote-board");
  const feed = { availability:{iran:{families:{gold:{state:"stale", sourceState:"received"}}}} };
  assert.equal(acceptsQuoteTick(feed,"gold",gram,{...gram,price:1},now), true);
  assert.equal(acceptsQuoteTick(feed,"gold",{...gram,sourceTime:"—"},gram,now), false);
  assert.equal(acceptsQuoteTick(feed,"gold",gram,{...gram,sourceTime:"17:00"},now), false);
  assert.equal(acceptsQuoteTick(feed,"gold",gram,gram,now+3600_000), false);
  assert.equal(acceptsQuoteTick({ availability:{iran:{families:{gold:{state:"ready", retained:true}}}} },"gold",gram,gram,now), false);
});
