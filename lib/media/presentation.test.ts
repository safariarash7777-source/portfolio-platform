import { test } from "node:test";
import assert from "node:assert/strict";
import { appearanceFrom, sourceUrl, uniqueMedia, filterMediaArchive, mediaArchiveBoundary, mediaArchiveFiltersFromHash, mediaArchiveHashWithPatch, recordedMediaDateLabel, recordedMediaDay, type MediaArchiveFilters, type MediaItem } from "./presentation";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
test("appearance accepts only three layouts and bounded identifiers, without access fields", () => {
  assert.deepEqual(appearanceFrom({ layout: 900, covers: "https://evil.test", role: "admin", featured: ["a", "a", 12, "b".repeat(200)] }), { layout: 1, covers: "editorial", featured: ["a"] });
  assert.equal(appearanceFrom(null).layout, 1);
  assert.equal(appearanceFrom({ layout: 3 }).layout, 3);
});
test("source links reject active content, host spoofing and private Telegram invites", () => {
  for (const url of ["javascript:alert(1)", "https://instagram.com.evil.test/x", "https://x.com@evil.test", "https://t.me/+invite", "https://t.me/c/123/4", "https://t.me/joinchat/private", "http://t.me/arash/1"]) assert.equal(sourceUrl(url), null);
  assert.equal(sourceUrl("https://www.instagram.com/reel/one/?stkn=tracking"), "https://www.instagram.com/reel/one/");
});
test("repeated content is shown once without deleting source records", () => {
  const item = { id: "one", platform: "telegram" as const, kind: "post" as const, content_url: "https://t.me/public/1", title: "Public", description: null, published_at: null };
  const list = [item, { ...item, id: "two", content_url: "https://t.me/public/1?tracking=yes" }];
  assert.equal(uniqueMedia(list).length, 1);
  assert.equal(list.length, 2);
});

test("Telegram dedupe normalizes channel case and trailing slash without merging case-sensitive post IDs", () => {
  const item = { id: "one", platform: "telegram" as const, kind: "post" as const, title: null, description: null, published_at: null, content_url: "https://t.me/Public_Channel/123" };
  const rows = [item, { ...item, id: "two", content_url: "https://t.me/public_channel/123/" }, { ...item, id: "three", content_url: "https://t.me/PUBLIC_CHANNEL/123/?track=1" }];
  assert.equal(uniqueMedia(rows).length, 1);
  assert.equal(rows.length, 3);
  const instagram = { ...item, platform: "instagram" as const };
  assert.equal(uniqueMedia([{ ...instagram, content_url: "https://www.instagram.com/p/CaseID/" }, { ...instagram, id: "different", content_url: "https://www.instagram.com/p/caseid/" }]).length, 2);
});

test("public Twitter aliases retain path case and deduplicate to X while rejecting spoofed hosts and private Telegram", () => {
  assert.equal(sourceUrl("https://twitter.com/Person/status/AbC?tracking=1"), "https://x.com/Person/status/AbC");
  assert.equal(sourceUrl("https://www.twitter.com/Person/status/AbC"), "https://x.com/Person/status/AbC");
  assert.equal(sourceUrl("https://www.x.com/Person/status/AbC"), "https://x.com/Person/status/AbC");
  const item = { id: "one", platform: "twitter" as const, kind: "post" as const, title: null, description: null, published_at: null, content_url: "https://twitter.com/Person/status/AbC" };
  assert.equal(uniqueMedia([item, { ...item, id: "two", content_url: "https://x.com/Person/status/AbC/" }]).length, 1);
  for (const url of ["https://twitter.com.evil.test/u/1", "https://twitter.com@evil.test/u/1", "https://t.me/C/123/456", "https://t.me/JoinChat/private", "https://t.me/+invite"]) assert.equal(sourceUrl(url), null);
});

const archiveDefaults: MediaArchiveFilters = { network: "all", kind: "all", query: "", from: "", to: "" };
function archiveItem(id: string, published_at: string | null, patch: Partial<MediaItem> = {}): MediaItem {
  return { id, platform: "telegram", kind: "post", content_url: `https://t.me/public/${id}`, title: "پادکست اقتصاد", description: null, published_at, ...patch };
}
function archiveRows(): MediaItem[] {
  return [archiveItem("before", "2025-09-22T20:29:59Z"), archiveItem("start", "2025-09-22T20:30:00Z"), archiveItem("end", "2025-09-23T20:29:59Z"), archiveItem("after", "2025-09-23T20:30:00Z"), archiveItem("unknown", null, { dateLabel: "۱ مهر ۱۴۰۴" }), archiveItem("invalid", "not-a-clock"), archiveItem("other-network", "2025-09-23T00:00:00+03:30", { platform: "instagram", kind: "reel" }), archiveItem("other-query", null, { title: "متن دیگر", kind: "video" })];
}

test("archive bounds reuse Jalali conversion with Persian/Arabic digits and reject calendar overflow", () => {
  assert.equal(mediaArchiveBoundary("۱۴۰۴/۰۷/۰۱"), "1404-07-01");
  assert.equal(mediaArchiveBoundary("١٤٠٤-٧-١"), "1404-07-01");
  assert.equal(mediaArchiveBoundary("1403/12/30"), "1403-12-30");
  for (const value of ["1404/12/30", "1404/07/31", "1404/13/01", "1404/00/01", "1404/01/00", "1404/", "", "not-a-date"]) assert.equal(mediaArchiveBoundary(value), null, value);
});

test("archive day is Tehran day and one-day boundaries include both ends", () => {
  const rows = archiveRows();
  assert.equal(recordedMediaDay(rows[0]), "1404-06-31");
  assert.equal(recordedMediaDay(rows[1]), "1404-07-01");
  assert.equal(recordedMediaDay(rows[2]), "1404-07-01");
  assert.equal(recordedMediaDay(rows[3]), "1404-07-02");
  assert.equal(recordedMediaDay(rows[6]), "1404-07-01");
  assert.equal(recordedMediaDateLabel({ ...rows[1], dateLabel: "برچسب متنی متفاوت" }), recordedMediaDateLabel(rows[1]), 'card and filter must use the same valid legacy clock');
  const result = filterMediaArchive(rows, { ...archiveDefaults, network: "telegram", kind: "post", query: "پادکست", from: "۱۴۰۴/۰۷/۰۱", to: "1404-07-01" });
  assert.deepEqual(result.shown.map(item => item.id), ["start", "end"]);
  assert.equal(result.unknownDateCount, 2);
  assert.equal(result.matchedBeforeDate, 6);
});

test("unknown clocks stay null; display label/title/link never supply filter dates", () => {
  const item = Object.freeze(archiveItem("unknown", null, { dateLabel: "۱ مهر ۱۴۰۴", title: "2025-09-23", content_url: "https://t.me/public/20250923" }));
  assert.equal(recordedMediaDay(item), null);
  assert.equal(recordedMediaDateLabel(item), "۱ مهر ۱۴۰۴");
  assert.equal(item.published_at, null);
  assert.equal(recordedMediaDay(archiveItem("numeric-clock", 0 as unknown as string)), null);
  for (const clock of [null, "", "0", "2025-09-23", "2025-09-23T00:00:00", "2025-02-31T00:00:00Z", "2025-09-23T24:00:00Z", "2025-09-23T00:60:00Z", "2025-09-23T00:00:00+99:00"]){
    const row = archiveItem("bad", clock);
    assert.equal(recordedMediaDay(row), null, String(clock));
    assert.equal(recordedMediaDateLabel(row), null);
  }
});

test("without bounds unknown dates remain; active bounds exclude them without mutating inputs", () => {
  const rows = archiveRows(); rows.forEach(Object.freeze); Object.freeze(rows);
  const before = JSON.stringify(rows);
  const base = { ...archiveDefaults, network: "telegram", kind: "post", query: "پادکست" };
  assert.equal(filterMediaArchive(rows, base).shown.length, 6);
  assert.deepEqual(filterMediaArchive(rows, { ...base, from: "1404/07/01" }).shown.map(item => item.id), ["start", "end", "after"]);
  assert.deepEqual(filterMediaArchive(rows, { ...base, to: "1404/07/01" }).shown.map(item => item.id), ["before", "start", "end"]);
  assert.equal(filterMediaArchive(rows, { ...base, network: "instagram", kind: "reel", from: "1404/07/01" }).unknownDateCount, 0);
  assert.equal(JSON.stringify(rows), before);
});

test("invalid or reversed date bounds never silently widen the results", () => {
  for (const [from, to, error] of [["1404/", "", "from"], ["", "1404/07/31", "to"], ["1404/07/02", "1404/07/01", "order"]]) {
    const result = filterMediaArchive(archiveRows(), { ...archiveDefaults, from, to });
    assert.equal(result.range.error, error);
    assert.deepEqual(result.shown, []);
  }
});

test("archive hash preserves search/type/date/layout and restores the same effective filters", () => {
  const hash = mediaArchiveHashWithPatch("#layout=2&anchor=kept", { network: "telegram", kind: "post", q: "پادکست", from: "۱۴۰۴/۰۷/۰۱", to: "1404/07/01" });
  assert.equal(new URLSearchParams(hash).get("layout"), "2");
  assert.equal(new URLSearchParams(hash).get("anchor"), "kept");
  const restored = mediaArchiveFiltersFromHash(`#${hash}`);
  assert.deepEqual(filterMediaArchive(archiveRows(), restored).shown.map(item => item.id), ["start", "end"]);
  const literalAll = mediaArchiveHashWithPatch(hash, { q: "all", from: "all" });
  assert.equal(mediaArchiveFiltersFromHash(literalAll).query, "all");
  assert.equal(mediaArchiveFiltersFromHash(literalAll).from, "all");
  const cleared = mediaArchiveHashWithPatch(hash, { network: "all", kind: "all", q: "", from: "", to: "" });
  assert.deepEqual(mediaArchiveFiltersFromHash(cleared), archiveDefaults);
  assert.equal(new URLSearchParams(cleared).get("layout"), "2");
  assert.equal(new URLSearchParams(cleared).get("anchor"), "kept");
});

test("archive day/filter is independent of device timezone", () => {
  const moduleUrl = pathToFileURL(resolve("lib/media/presentation.ts")).href;
  const script = `import * as loaded from ${JSON.stringify(moduleUrl)}; const {recordedMediaDay,filterMediaArchive}=loaded.default ?? loaded; const rows=[{id:'a',platform:'telegram',kind:'post',content_url:'https://t.me/public/a',title:null,description:null,published_at:'2025-09-22T20:30:00Z'}];console.log(JSON.stringify([recordedMediaDay(rows[0]),filterMediaArchive(rows,{network:'all',kind:'all',query:'',from:'1404/07/01',to:'1404/07/01'}).shown.map(r=>r.id)]));`;
  for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
    const run = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: process.cwd(), env: { ...process.env, TZ: timezone }, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout.trim()), ["1404-07-01", ["a"]], timezone);
  }
});
