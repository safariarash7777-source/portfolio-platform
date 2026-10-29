import { test } from "node:test";
import assert from "node:assert/strict";
import { codalFeedFailure, codalFeedItems, codalFeedWindow, codalFeedQuery } from "./codal-feed";

test("permission, column and transport failures cannot claim that an existing feed is uninstalled", () => {
  assert.equal(codalFeedFailure(null), null);
  for (const code of ["42501", "42703", "PGRST204", "", undefined]) assert.equal(codalFeedFailure({ code }), "unavailable");
  for (const code of ["42P01", "PGRST205"]) assert.equal(codalFeedFailure({ code }), "missing");
});

test("malformed response fails rather than presenting a false empty feed", () => {
  assert.throws(() => codalFeedItems({ error: "unavailable" }));
  assert.deepEqual(codalFeedItems([]), []);
});

test("bounded feed declares 30 from 60 without claiming history completeness or refreshing dates", () => {
  const rows = Array.from({length:60}, (_, i) => ({title:`report ${i}`,link:`https://codal.ir/${i}`,sent_date:"1404/01/01",sent_time:"10:00"}));
  const result=codalFeedWindow(rows);
  assert.equal(codalFeedQuery("فولاد").get("limit"),"60");
  assert.equal(result.data.length,30);
  assert.deepEqual(result.window,{readLimit:60,displayLimit:30,rowsRead:60,itemsReturned:30,totalHistory:null,completeHistory:false});
  assert.equal(result.data[0].date,"1404/01/01");
  assert.equal(codalFeedWindow([rows[0], rows[0], {}, null]).data.length,1);
  assert.equal(codalFeedWindow([]).window.completeHistory,false);
  assert.throws(()=>codalFeedWindow({error:"offline"}));
});
