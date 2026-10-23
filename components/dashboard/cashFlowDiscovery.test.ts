import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as format from "../../lib/format";

test("ordinary-member dashboard exposes the real independent cash-flow route without fabricated activity", () => {
  const loaded = { exports: {} as { default: (props: unknown) => React.ReactElement } };
  const jsx = (type: React.ElementType, props: object) => React.createElement(type, props);
  runInNewContext(ts.transpileModule(readFileSync(new URL("../../app/(protected)/dashboard/DashboardClient.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports: loaded.exports, require(name: string) {
    if (name === "react") return { useState: (initial: unknown) => [initial, () => {}], useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }) };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: React.Fragment };
    if (name === "next/link") return { __esModule: true, default: (props: object) => React.createElement("a", props) };
    if (name === "next/navigation") return { useRouter: () => ({}) };
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (name === "@/lib/format") return format;
    if (name === "@/components/quiz/quizData") return { RISK_PROFILES: {} };
    return { __esModule: true, default: () => null };
  } });
  const html = renderToStaticMarkup(loaded.exports.default({ userId: "synthetic-member", userName: "عضو مصنوعی", userEmail: "", userRole: "user", assessment: null, portfolio: null, holdings: [], snapshots: [], transactions: [], telegramLinked: false, payment: null, scoreHistory: [], revalidationExpiredAt: null, announcements: [], portfolioVersions: [] }));
  assert.match(html, /href="\/dashboard\/cashflow"[^>]*>بازکردن دفتر جریان نقد/);
  assert.match(html, /آرش صفری · فضای مالی شخصی/);
  assert.match(html, /نبود ثبت، درآمد یا هزینهٔ صفر را تأیید نمی‌کند/);
  assert.match(html, /دارایی و قسط خودکار به این دفتر منتقل نمی‌شوند/);
  assert.doesNotMatch(html, /آرش سفری|آرش سفاری|href="\/admin/);
  for (const label of ["مشاهده و ثبت دارایی", "مشاهده و ثبت بدهی", "بررسی محدودهٔ سبد"]) assert.match(html, new RegExp(`href="/dashboard/holdings"[^>]*>${label}`));
});
