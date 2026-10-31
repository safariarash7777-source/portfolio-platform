import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as format from "../../lib/format";
import { createRequire } from "node:module";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import AccessStatusCard from "./AccessStatusCard";
import ReadError from "./ReadError";
import { authSessionFailure } from "../../lib/auth/session-error";
import { withDeadline } from "../../lib/deadline";
import * as returnPath from "../account/returnPath";
import type { AccessInfo } from "../../lib/access";
Object.assign(globalThis, { React });

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
  assert.match(html, /href="\/dashboard\/cashflow#period-budget"[^>]*>بررسی بودجه و هزینه‌ها/);
  assert.match(html, /href="\/dashboard\/goals"[^>]*>ثبت و پیگیری هدف مالی/);
  assert.match(html, /آرش صفری · فضای مالی شخصی/);
  assert.match(html, /نبود ثبت، درآمد یا هزینهٔ صفر را تأیید نمی‌کند/);
  assert.match(html, /دارایی و قسط خودکار به این دفتر منتقل نمی‌شوند/);
  assert.doesNotMatch(html, /آرش سفری|آرش سفاری|href="\/admin/);
  for (const label of ["مشاهده و ثبت دارایی", "مشاهده و ثبت بدهی", "بررسی محدودهٔ سبد"]) assert.match(html, new RegExp(`href="/dashboard/holdings"[^>]*>${label}`));
});

const requireAtTest = createRequire(import.meta.url);
function protectedPageFixture(path: string, options: { user?: { id: string }; error?: unknown; throws?: boolean; never?: boolean } = {}) {
  const redirects: string[] = [], deadlines: number[] = [];
  let privateReads = 0, authReads = 0;
  const taskModule = { exports: {} as { default: (props: unknown) => Promise<React.ReactElement> } };
  const client = { auth: { getUser: async () => {
    authReads++;
    if (options.throws) throw new Error('Synthetic auth transport failure');
    if (options.never) return new Promise<never>(() => {});
    return { data: { user: options.user ?? null }, error: options.error ?? null };
  } }, from: () => { privateReads++; throw new Error('Private query reached without verified identity'); } };
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const stubs: Record<string, unknown> = {
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/auth/session-error': { authSessionFailure },
    '@/lib/deadline': { withDeadline: (load: (signal: AbortSignal) => Promise<unknown>, ms: number) => { deadlines.push(ms); return withDeadline(load, options.never ? 5 : ms); } },
    '@/components/account/returnPath': returnPath,
    '@/components/dashboard/ReadError': { __esModule: true, default: ReadError },
    './DashboardClient': { __esModule: true, default: () => null },
    'next/navigation': { redirect: (destination: string) => { redirects.push(destination); throw new Error('FIXTURE_REDIRECT'); } },
  };
  runInNewContext(source, { module: taskModule, exports: taskModule.exports, require(name: string) {
    if (name in stubs) return stubs[name];
    if (name.startsWith('@/')) return { __esModule: true, default: () => null };
    return requireAtTest(name);
  } });
  return { run: taskModule.exports.default, redirects, deadlines, privateReads: () => privateReads, authReads: () => authReads };
}
function renderWithRouter(element: React.ReactElement) {
  const router = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, hmrRefresh() {}, async prefetch() {} };
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router }, element));
}
const privateChild = React.createElement('p', null, 'PRIVATE_MEMBER_OR_ADMIN_CONTENT');

for (const path of ['../../app/(protected)/layout.tsx', '../../app/(protected)/dashboard/page.tsx']) {
  for (const options of [{ error: { status: 503 } }, { error: { status: 429 }, user: { id: 'synthetic-member' } }, { throws: true }]) {
    test(`${path}: an unavailable identity does not redirect as guest, query private data or render children`, async () => {
      const fixture = protectedPageFixture(path, options);
      const html = renderWithRouter(await fixture.run({ children: privateChild }));
      assert.deepEqual(fixture.redirects, []);
      assert.equal(fixture.privateReads(), 0);
      assert.ok(fixture.deadlines.length > 0, 'reuse the bounded existing auth read');
      assert.doesNotMatch(html, /PRIVATE_MEMBER_OR_ADMIN_CONTENT/);
      assert.match(html, /نشست|ورود/);
      assert.match(html, /تلاش مجدد/);
    });
  }
  test(`${path}: explicit expired/rejected session uses the existing safe login contract`, async () => {
    const fixture = protectedPageFixture(path, { user: { id: 'synthetic-member' }, error: { status: 400, code: 'session_expired' } });
    await assert.rejects(fixture.run({ children: privateChild }), /FIXTURE_REDIRECT/);
    assert.equal(fixture.redirects.length, 1);
    const target = new URL(fixture.redirects[0], 'https://fixture.invalid');
    assert.equal(target.pathname, '/login');
    assert.equal(returnPath.normalizeReturnPath(target.searchParams.get('next'), '/dashboard'), '/dashboard');
    assert.equal(fixture.privateReads(), 0);
  });
  test(`${path}: a never-settled auth read becomes recoverable unknown without a second request`, { timeout: 150 }, async () => {
    const fixture = protectedPageFixture(path, { never: true });
    const html = renderWithRouter(await fixture.run({ children: privateChild }));
    assert.deepEqual(fixture.redirects, []);
    assert.equal(fixture.privateReads(), 0);
    assert.equal(fixture.deadlines.length, 1);
    assert.equal(fixture.authReads(), 1);
    assert.doesNotMatch(html, /PRIVATE_MEMBER_OR_ADMIN_CONTENT/);
  });
}

for (const id of ['synthetic-member-a', 'synthetic-member-b', 'synthetic-admin']) test(`verified ${id}: protected layout preserves its child; role ACL is not replaced by this layout`, async () => {
  const fixture = protectedPageFixture('../../app/(protected)/layout.tsx', { user: { id } });
  const child = React.createElement('p', null, id);
  const html = renderWithRouter(await fixture.run({ children: child }));
  assert.match(html, new RegExp(id));
  assert.deepEqual(fixture.redirects, []);
  assert.equal(fixture.privateReads(), 0);
});

const access: AccessInfo = { level: 'registered', via: null, expiresAt: null, standing: null, standingSince: null, userId: 'synthetic-member', email: null };
for (const [standing, phrase] of [[null, 'نامشخص'], ['expired', 'پایان'], ['revoked', 'لغو'], ['scheduled', 'هنوز شروع نشده']] as const) test(`access ${standing}: no false registered upgrade, preserve the basic-file and separate service/consent boundary`, () => {
  const html = renderWithRouter(React.createElement(AccessStatusCard, { access: { ...access, standing } }));
  assert.ok(html.includes(phrase));
  assert.doesNotMatch(html, /کاربر ثبت‌نام‌شده|ثبت‌نام وبینار بعدی|دسترسی کامل به همه/);
  assert.match(html, /href="\/dashboard\/holdings"/);
  assert.match(html, /به خرید متصل نشده/);
});

test('active admin/analytical access never implies a consultation entitlement or consent', () => {
  const html = renderWithRouter(React.createElement(AccessStatusCard, { access: { ...access, level: 'full', via: 'admin', standing: 'active' } }));
  assert.match(html, /مدیر سامانه/);
  assert.match(html, /به خرید متصل نشده/);
  assert.match(html, /رضایت/);
});
