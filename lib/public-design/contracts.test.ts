import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { MARKET_SECTIONS } from "../market-nav";
import { marketQualityLabel } from "../market-quality";
import { publicMetricLabels } from "./metrics";
import type { HeadlineMetric } from "../core/marketHeadline";
import { publicLayout, publicLayoutHref } from "./layout";
import { isKind, isPlatform, KIND_LABEL, PLATFORM_META } from "../content-hub";
import { editorialCover, sourceUrl, uniqueMedia } from "../media/presentation";
import { formatJalali } from "../format";
import type { HomeMediaRead } from "./home-media";
import { withDeadline } from "../deadline";
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
  assert.equal(publicLayoutHref("/market", 3), "/market");
  assert.equal(
    publicLayoutHref("/market", 3, true),
    "/market?appearance_preview=1&design=3",
  );
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

const nodeRequire = createRequire(import.meta.url);
const PreviewSlot = () => null;
const WarningSlot = () => null;
function component(
  name: string,
  additional: Record<string, unknown> = {},
  window?: unknown,
) {
  const result = {} as {
    default: (
      props: Record<string, unknown>,
    ) => React.ReactElement<Record<string, unknown>>;
  };
  const source = readFileSync(
    new URL(`../../components/public-design/${name}.tsx`, import.meta.url),
    "utf8",
  );
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": nodeRequire("react/jsx-runtime"),
    "lucide-react": nodeRequire("lucide-react"),
    "next/link": {
      default: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      __esModule: true,
    },
    "@/lib/public-design/layout": { publicLayout, publicLayoutHref },
    "./SiteLayoutPreview": { __esModule: true, default: PreviewSlot },
    "./SiteAppearanceWarning": { __esModule: true, default: WarningSlot },
    "./PublicDesign.module.css": {
      __esModule: true,
      default: new Proxy({}, { get: (_target, key) => String(key) }),
    },
    ...additional,
  };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports: result,
      window,
      URL,
      require: (id: string) => {
        if (id in dependencies) return dependencies[id];
        throw new Error(id);
      },
    },
  );
  return result.default;
}
function elements(
  node: React.ReactNode,
): React.ReactElement<Record<string, unknown>>[] {
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, unknown>>;
  const children = element.props.children;
  return [
    element,
    ...(Array.isArray(children)
      ? children.flat(Infinity).flatMap(elements)
      : elements(children as React.ReactNode)),
  ];
}
test("authorized preview follows URL across navigation/back and native replacement, preserving loaded children", () => {
  let href =
    "https://site.example.test/market?appearance_preview=1&design=2&find=TEST#report";
  let routerHref = href;
  const entries = [href];
  let cursor = 0;
  const navigate = (url: string) => {
    entries.splice(cursor + 1);
    entries.push(url);
    cursor += 1;
    href = url;
    routerHref = href;
  };
  const move = (delta: number) => {
    cursor += delta;
    href = entries[cursor];
    routerHref = href;
  };
  const historyState = { __NA: true, retained: "router state" };
  const Frame = component(
    "PublicDesignFrame",
    {
      "next/navigation": {
        useSearchParams: () => new URL(routerHref).searchParams,
      },
    },
    {
      location: {
        get href() {
          return href;
        },
      },
      history: {
        state: historyState,
        replaceState: (state: unknown, _title: string, url: string) => {
          href = new URL(url, href).href;
          entries[cursor] = href;
          // Next's native-history patch skips its router update for internal __NA entries.
          if (state && typeof state === "object" && "__NA" in state) return;
          routerHref = href;
        },
      },
    },
  );
  const child = React.createElement("input", {
    defaultValue: "retained filter",
  });
  const props = {
    appearance: { state: "ready", globalLayout: 2, previewLayout: 2 },
    page: "market",
    navigation: null,
    footer: null,
    children: child,
  };
  let tree = Frame(props);
  assert.equal(tree.props["data-public-layout"], 2);
  const first = elements(tree).find((el) => el.type === PreviewSlot)!;
  (first.props.onChoose as (value: number) => void)(1);
  assert.equal(new URL(href).searchParams.get("design"), "1");
  assert.equal(new URL(href).searchParams.get("find"), "TEST");
  assert.equal(new URL(href).hash, "#report");
  tree = Frame(props);
  assert.equal(tree.props["data-public-layout"], 1);
  assert.ok(elements(tree).some((element) => Object.is(element, child)));
  navigate("https://site.example.test/market?appearance_preview=1&design=3");
  assert.equal(Frame(props).props["data-public-layout"], 3);
  navigate("https://site.example.test/market");
  assert.equal(Frame(props).props["data-public-layout"], 2);
  // The router supplies these URLs after backward/forward navigation. Browser integration is checked separately.
  move(-1);
  assert.equal(Frame(props).props["data-public-layout"], 3);
  move(-1);
  assert.equal(Frame(props).props["data-public-layout"], 1);
  move(1);
  assert.equal(Frame(props).props["data-public-layout"], 3);
  move(1);
  assert.equal(Frame(props).props["data-public-layout"], 2);
  href =
    "https://site.example.test/market?appearance_preview=1&design=2&design=3";
  routerHref = href;
  assert.equal(Frame(props).props["data-public-layout"], 1);
});

test("public frame cannot override saved layout through URL and explicit fallback retains content", () => {
  let href =
    "https://site.example.test/?appearance_preview=1&design=3#layout=3";
  const Frame = component("PublicDesignFrame", {
    "next/navigation": { useSearchParams: () => new URL(href).searchParams },
  });
  const content = React.createElement(
    "p",
    null,
    "existing factual home content",
  );
  const props = {
    appearance: { state: "ready", globalLayout: 2, previewLayout: null },
    page: "home",
    navigation: null,
    footer: null,
    children: content,
  };
  let tree = Frame(props);
  assert.equal(tree.props["data-public-layout"], 2);
  assert.equal(
    elements(tree).some((el) => el.type === PreviewSlot),
    false,
  );
  assert.ok(elements(tree).some((el) => Object.is(el, content)));
  href = "https://site.example.test/?design=1";
  assert.equal(Frame(props).props["data-public-layout"], 2);
  tree = Frame({
    ...props,
    appearance: {
      state: "unavailable",
      globalLayout: null,
      previewLayout: null,
    },
  });
  assert.equal(tree.props["data-public-layout"], "fallback");
  assert.ok(elements(tree).some((el) => el.type === WarningSlot));
  assert.ok(elements(tree).some((el) => Object.is(el, content)));
});
test("actual market header shows raw board state only with independently ready index family", () => {
  const Header = component("PublicMarketHeader", {
    "@/components/market/MarketAutoRefresh": {
      __esModule: true,
      default: () => null,
    },
    "@/components/market/MarketSearch": {
      __esModule: true,
      default: () => null,
    },
    "@/lib/market-nav": { MARKET_SECTIONS },
    "@/lib/market-quality": { marketQualityLabel },
  });
  const props = {
    index: [],
    from: "/market",
    boardState: "synthetic-board-open",
  };
  for (const state of ["ready", "stale", "unknown-time"]) {
    const html = renderToStaticMarkup(
      Header({
        ...props,
        availability: { state: "ready", families: { indices: { state } } },
      }),
    );
    assert.equal(html.includes("synthetic-board-open"), state === "ready");
  }
});
test("source failure changes only missing-value explanation, never any engine number or valid coverage", () => {
  const missing = {
    key: "net",
    label: "synthetic",
    value: null,
    unit: "toman",
    changePercent: null,
    absentReason: "outside hours",
    coverage: null,
    note: null,
  } satisfies HeadlineMetric;
  const known = { ...missing, key: "known", value: 100, absentReason: null };
  const data = [missing, known];
  assert.equal(publicMetricLabels(data, true), data);
  const failure = publicMetricLabels(data, false);
  assert.equal(failure[0].value, null);
  assert.equal(failure[0].absentReason, "دادهٔ منبع در دسترس نیست");
  assert.equal(failure[1], known);
  assert.equal(missing.absentReason, "outside hours");
});

const homeMediaModule = {} as {
  readHomeMedia: (client: unknown) => Promise<HomeMediaRead>;
};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("./home-media.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports: homeMediaModule,
    require: (id: string) => {
      if (id === "server-only") return {};
      if (id === "@/lib/content-hub") return { isKind, isPlatform };
      if (id === "@/lib/media/presentation") return { uniqueMedia };
      if (id === "@/lib/deadline") return { withDeadline };
      throw new Error(id);
    },
  },
);
function mediaClient(data: unknown[], error: unknown = null) {
  const query = {
    select: (columns: string) => {
      assert.equal(
        columns,
        "id, platform, kind, content_url, title, published_at",
      );
      return query;
    },
    is: (key: string, value: unknown) => {
      assert.equal(key, "deleted_at");
      assert.equal(value, null);
      return query;
    },
    not: (key: string, op: string, value: unknown) => {
      assert.equal(key, "published_at");
      assert.equal(op, "is");
      assert.equal(value, null);
      return query;
    },
    order: () => query,
    abortSignal: (signal: AbortSignal) => {
      assert.ok(signal instanceof AbortSignal);
      return query;
    },
    limit: async (limit: number) => {
      assert.equal(limit, 60);
      return { data, error };
    },
  };
  return {
    from: (table: string) => {
      assert.equal(table, "content_hub");
      return query;
    },
  };
}
test("home media keeps existing projection, deduplicates public source links and distinguishes failed read from empty", async () => {
  const row = {
    id: "synthetic",
    platform: "telegram",
    kind: "post",
    title: "fixture",
    content_url: "https://t.me/public_fixture/1",
    published_at: "2026-01-01",
    description: "must not be projected",
    likes: 500,
  };
  const result = await homeMediaModule.readHomeMedia(
    mediaClient([
      row,
      { ...row, id: "duplicate" },
      { ...row, id: "private", content_url: "https://t.me/c/123/456" },
    ]),
  );
  assert.equal(result.state, "ready");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].description, null);
  assert.equal("likes" in result.items[0], false);
  assert.equal(result.items[0].published_at, "2026-01-01");
  assert.ok(
    Date.parse(result.readAt) > Date.parse(result.items[0].published_at!),
  );
  assert.equal(
    (await homeMediaModule.readHomeMedia(mediaClient([]))).state,
    "empty",
  );
  assert.equal(
    (await homeMediaModule.readHomeMedia(mediaClient([], { code: "offline" })))
      .state,
    "unavailable",
  );
  assert.equal(
    (
      await homeMediaModule.readHomeMedia({
        from: () => {
          throw new Error("offline");
        },
      })
    ).state,
    "unavailable",
  );
});
test("home media remains visible in empty/error, labels old record date separately and never renders a pretend player", () => {
  const Media = component("PublicHomeMedia", {
    "@/lib/content-hub": { KIND_LABEL, PLATFORM_META },
    "@/lib/format": { formatJalali },
    "@/lib/media/presentation": { editorialCover, sourceUrl },
    "./PublicMediaArtwork": {
      __esModule: true,
      default: () => React.createElement("span", null, "editorial fixture"),
    },
  });
  const read = { state: "empty", items: [], readAt: "2026-10-17T12:00:00Z" };
  for (const state of ["empty", "unavailable"]) {
    const html = renderToStaticMarkup(Media({ read: { ...read, state } }));
    assert.match(html, /id="home-media"/);
    assert.match(html, /رفتن به رسانهٔ آرش/);
    assert.match(
      html,
      state === "empty" ? /هنوز محتوای قابل‌نمایشی/ : /role="alert"/,
    );
  }
  const html = renderToStaticMarkup(
    Media({
      read: {
        ...read,
        state: "ready",
        items: [
          {
            id: "fixture",
            platform: "instagram",
            kind: "reel",
            title: "synthetic title",
            content_url: "https://www.instagram.com/reel/fixture/",
            published_at: "2026-01-01",
            description: null,
          },
        ],
      },
    }),
  );
  assert.match(html, /بیش از هفت روز/);
  assert.match(html, /تاریخ ثبت‌شدهٔ قبلی الزاماً زمان انتشار/);
  assert.match(html, /آخرین همگام‌سازی جداگانه/);
  assert.match(html, /مشاهده در اینستاگرام/);
  assert.doesNotMatch(html, /<video|<audio|<iframe/);
  const home = renderToStaticMarkup(component("PublicHome")({}));
  assert.match(home, /id="public-home-title">آرش سفری/);
  assert.doesNotMatch(
    home,
    /دید روشن‌تر|امروز را از کجا شروع|ورود به نمای بازار/,
  );
});

test("actual home reader keeps Twitter aliases and one canonical Telegram post instead of false empty or duplicate cards", async () => {
  const row = {
    id: "tg",
    platform: "telegram",
    kind: "post",
    title: "fixture",
    content_url: "https://t.me/Public_Fixture/123",
    published_at: "2026-01-01",
  };
  const result = await homeMediaModule.readHomeMedia(
    mediaClient([
      row,
      {
        ...row,
        id: "tg-duplicate",
        content_url: "https://t.me/public_fixture/123/",
      },
      {
        ...row,
        id: "twitter",
        platform: "twitter",
        content_url: "https://www.twitter.com/PublicFixture/status/AbC",
      },
    ]),
  );
  assert.equal(result.state, "ready");
  assert.equal(result.items.length, 2);
  assert.equal(result.items[1].platform, "twitter");
  const onlyTwitter = await homeMediaModule.readHomeMedia(
    mediaClient([
      {
        ...row,
        platform: "twitter",
        content_url: "https://twitter.com/PublicFixture/status/AbC",
      },
    ]),
  );
  assert.equal(onlyTwitter.state, "ready");
});
