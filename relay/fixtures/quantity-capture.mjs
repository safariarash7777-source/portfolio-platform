// Test-only stored row: archived HTML passes through the actual producer and
// insert payload builder; transport and database-assigned ID/time are synthetic.
import { foladQuantityFixture, loadOfflineCodal } from "./codal-offline.mjs";
export async function capturedFoladRow(id = 701) {
  const fixture = foladQuantityFixture();
  const announcement = { l18: "فولاد", link: "https://codal.ir/Reports/quantity-reader-offline-test",
    link_excel: fixture.origin.sourceId, date_title: "1405/06/31", title: "گزارش فعالیت ماهانه دوره ۱ ماهه",
    date_publish: "1405/07/01", time_publish: "11:12:13" };
  let stored = null;
  const { parser, counts } = loadOfflineCodal({
    environment: { SUPABASE_URL: "https://quantity-store.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-only" },
    fetchFixture: async (url, init) => {
      if (url === announcement.link_excel && !init.method) {
        const response = new Response(fixture.bytes);
        Object.defineProperty(response, "url", { value: announcement.link_excel });
        return response;
      }
      if (url === "https://quantity-store.invalid/rest/v1/codal_reports?on_conflict=source_url&select=source_url" && init.method === "POST") {
        [stored] = JSON.parse(init.body);
        return Response.json([{ source_url: stored.source_url }]);
      }
      throw new Error("Unexpected synthetic quantity fixture request");
    },
  });
  const data = await parser.downloadAndParse(announcement, "ن-۳۰");
  await parser.insertParsedReport(announcement, "ن-۳۰", data);
  if (!stored?.raw?.quantity_capture || counts.network !== 0) throw new Error("Missing offline producer capture");
  return { row: { ...stored, id, captured_at: "2026-10-31T10:20:30.123456+03:30" }, counts };
}
