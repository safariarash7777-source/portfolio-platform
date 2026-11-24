import test from "node:test";
import assert from "node:assert/strict";
import { readV2AnnouncementPage } from "./codal.mjs";

const row = { link: "https://codal.ir/report", link_excel: null };
const page = { successful: true, code_http: 200, page: 1, count_page: 1, count_announcement: 1, data: [row] };
test("V2 preserves source identity and missing workbook", () => {
  assert.deepEqual(readV2AnnouncementPage(page, 1), [row]);
});
test("V2 refuses quota errors and inconsistent pages", () => {
  assert.throws(() => readV2AnnouncementPage({successful: false, code_http: 429}, 1), {status: 429, noRetry: true});
  for (const invalid of [{page: 2}, {data: []}, {data: [{link: null}]}, {data: null}, {count_page: null}]) {
    assert.throws(() => readV2AnnouncementPage({...page, ...invalid}, 1));
  }
  assert.deepEqual(readV2AnnouncementPage({...page, count_page: 0, count_announcement: 0, data: []}, 1), []);
});
