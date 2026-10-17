import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { publicLayout, publicLayoutHref } from "./layout";
import {
  approvedCodalUrl,
  type DeskCompanyReport,
  type DeskRead,
} from "../desk/workspace-model";

test("only three URL presentation choices; unknown or repeated choices use default", () => {
  assert.equal(publicLayout("2"), 2);
  assert.equal(publicLayout("3"), 3);
  for (const value of [undefined, "", "0", "4", "02", "admin", ["2", "3"]])
    assert.equal(publicLayout(value), 1);
  assert.equal(publicLayoutHref("/", 1), "/");
  assert.equal(publicLayoutHref("/market", 3), "/market?design=3");
});
const exported = {} as {
  publicReports: (client: unknown) => Promise<DeskRead<DeskCompanyReport[]>>;
};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("./reports.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports: exported,
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "@/lib/desk/workspace-model") return { approvedCodalUrl };
      throw new Error(name);
    },
  },
);
function client(data: unknown[], error: unknown = null) {
  const query = {
    select: (columns: string) => {
      assert.equal(
        columns,
        "id,symbol,title,category,sent_date,sent_time,created_at,link",
      );
      return query;
    },
    order: () => query,
    limit: async (limit: number) => {
      assert.equal(limit, 12);
      return { data, error };
    },
  };
  return {
    from: (name: string) => {
      assert.equal(name, "codal_feed");
      return query;
    },
  };
}
test("public metadata read distinguishes valid empty, returned failure and thrown failure", async () => {
  assert.equal((await exported.publicReports(client([]))).state, "empty");
  assert.equal(
    (await exported.publicReports(client([], { code: "42501" }))).state,
    "unavailable",
  );
  assert.equal(
    (
      await exported.publicReports({
        from: () => {
          throw new Error("offline");
        },
      })
    ).state,
    "unavailable",
  );
});
test("metadata times stay independent and unknown; unsafe source URL is never rendered", async () => {
  const result = await exported.publicReports(
    client([
      {
        id: 7,
        symbol: "TEST",
        title: "synthetic metadata",
        category: null,
        sent_date: "1405/07/25",
        sent_time: null,
        created_at: null,
        link: "javascript:alert(1)",
      },
    ]),
  );
  assert.equal(result.state, "ready");
  const row = result.data[0];
  assert.equal(row.sourceDate, "1405/07/25");
  assert.equal(row.sourceTime, null);
  assert.equal(row.recordedAt, null);
  assert.equal(row.url, null);
  assert.equal(row.id, "7");
});
