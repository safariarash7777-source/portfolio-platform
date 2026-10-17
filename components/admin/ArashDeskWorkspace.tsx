"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  ArrowUpLeft,
  LineChart,
  FileText,
  LayoutDashboard,
  RefreshCw,
  Settings2,
  ShieldAlert,
  X,
} from "lucide-react";
import IndexTrendChart from "@/components/market/IndexTrendChart";
import {
  formatCount,
  formatJalali,
  formatTehranClock,
  toPersianDigits,
} from "@/lib/format";
import { marketQualityLabel } from "@/lib/market-quality";
import {
  chartWindow,
  deskObservations,
  splitDeskObservations,
  type ArashDeskData,
} from "@/lib/desk/workspace-model";
import {
  DESK_TOOLS,
  TOOL_LABELS,
  type DeskLayout,
  type DeskTool,
} from "@/lib/desk/preferences";
import { useDeskAccountPreferences } from "./useDeskAccountPreferences";
import s from "./ArashDeskWorkspace.module.css";

const LAYOUTS = ["دید بازار", "میز پژوهش", "پایش ریسک"];
const RULE_LABELS = {
  nav_stale: "تازگی NAV",
  nav_missing: "وجود NAV",
  premium_outlier: "فاصله از هم‌نوع‌ها",
  band_edge: "نزدیکی به دامنه",
  board_gap: "فاصلهٔ تابلو",
};
const qualityLabel = (
  state: ArashDeskData["market"]["availability"]["state"],
) =>
  state === "timeout"
    ? "دریافت تازه در مهلت مقرر پاسخ نداد"
    : marketQualityLabel(state);
function stamp(value: string | number | null | undefined) {
  if (value == null || !Number.isFinite(new Date(value).getTime()))
    return "ثبت نشده";
  return `${formatJalali(new Date(value))}، ${formatTehranClock(new Date(value))}`;
}
function Empty({ children }: { children: ReactNode }) {
  return <p className={s.empty}>{children}</p>;
}
function Panel({
  id,
  title,
  subtitle,
  children,
  action,
}: {
  id: DeskTool;
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={`${s.panel} ${s[id]}`} aria-labelledby={`desk-${id}`}>
      <header className={s.panelHeader}>
        <div>
          <h2 id={`desk-${id}`}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export default function ArashDeskWorkspace({ data }: { data: ArashDeskData }) {
  const prefs = useDeskAccountPreferences();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [range, setRange] = useState(90);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState<{
    title: string;
    body: ReactNode;
  } | null>(null);
  const [settings, setSettings] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const restore = useRef<(() => void) | null>(null);
  const engine = useMemo(
    () => deskObservations(data.market.data, Date.parse(data.readAt)),
    [data.market.data, data.readAt],
  );
  const observations = useMemo(
    () => splitDeskObservations(engine.observations),
    [engine],
  );
  const series = useMemo(
    () => chartWindow(data.chart.data, range),
    [data.chart.data, range],
  );
  const categories = [
    ...new Set(
      data.reports.data
        .map((row) => row.category)
        .filter((v): v is string => !!v),
    ),
  ];
  const reports = data.reports.data.filter(
    (row) =>
      (!category || row.category === category) &&
      `${row.symbol} ${row.title}`.includes(query.trim()),
  );
  const dirty =
    !!prefs.receipt &&
    (prefs.draft.layout !== prefs.receipt.preferences.layout ||
      [...prefs.draft.hiddenTools].sort().join() !==
        [...prefs.receipt.preferences.hiddenTools].sort().join());
  const indices = data.market.data?.indices;
  const quality = data.market.availability;
  const show = (id: DeskTool) => !prefs.draft.hiddenTools.includes(id);
  const layout = (id: DeskLayout) =>
    prefs.setDraft((current) => ({ ...current, layout: id }));
  function open(title: string, body: ReactNode) {
    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const scroll = [
      document.scrollingElement,
      ...Array.from(document.querySelectorAll("main, [data-scroll-container]")),
    ]
      .filter((el): el is Element => !!el)
      .map((el) => ({ el, top: el.scrollTop, left: el.scrollLeft }));
    restore.current = () => {
      focused?.focus({ preventScroll: true });
      scroll.forEach(({ el, top, left }) => el.scrollTo(left, top));
    };
    setDetail({ title, body });
    dialog.current?.showModal();
  }
  function close() {
    dialog.current?.close();
  }
  function sourceClock(symbol: string) {
    const fund = data.market.data?.funds.find((row) => row.id === symbol);
    const stock = data.market.data?.stocks.find((row) => row.id === symbol);
    const row = fund ?? stock;
    const family = fund ? quality.families?.funds : quality.families?.stocks;
    return (
      <p className={s.note}>
        منبع: فید بازار ایران ·{" "}
        {family ? marketQualityLabel(family.state) : "کیفیت زمان نامشخص"}
        <br />
        زمان قیمت در منبع:{" "}
        {row?.sourceDate
          ? toPersianDigits(`${row.sourceDate} ${row.sourceTime ?? ""}`)
          : "ثبت نشده"}
        <br />
        {fund && (
          <>
            زمان NAV در منبع:{" "}
            {fund.navDate
              ? toPersianDigits(`${fund.navDate} ${fund.navTime ?? ""}`)
              : "ثبت نشده"}
            <br />
          </>
        )}
        دریافت این خانواده: {stamp(family?.receivedAt)}
        <br />
        خواندن بازار: {stamp(quality.readAt)}
      </p>
    );
  }
  const observationList = (rows: typeof engine.observations) =>
    rows.length ? (
      <ul className={s.list} data-scroll-container>
        {rows.slice(0, 8).map((row) => (
          <li key={row.id}>
            <button
              className={s.row}
              onClick={() =>
                open(
                  row.symbol,
                  <>
                    <p>{row.faName}</p>
                    <h3>{row.headline}</h3>
                    <dl className={s.facts}>
                      {row.drivers.map((driver, index) => (
                        <div key={index}>
                          <dt>{driver.label}</dt>
                          <dd>{toPersianDigits(driver.value)}</dd>
                        </div>
                      ))}
                    </dl>
                    {sourceClock(row.symbol)}
                    <p className={s.note}>
                      این مشاهده از قواعد موجود میز بازار است؛ دادهٔ مبنا ممکن
                      است کامل یا تازه نباشد.
                    </p>
                    <Link href={`/symbol/${encodeURIComponent(row.symbol)}`}>
                      صفحهٔ نماد
                    </Link>
                  </>,
                )
              }
            >
              <span>
                <strong>{row.symbol}</strong>
                <small>{row.headline}</small>
              </span>
              <span className={s.badge}>{row.band}</span>
              <ArrowUpLeft size={16} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <Empty>
        {quality.state === "empty"
          ? "منبع پاسخ معتبر بدون داده داده است؛ داده‌ای برای اجرای قواعد نیست."
          : data.market.data
            ? engine.coverage.some((row) => row.examined > 0)
              ? "در دادهٔ قابل بررسی، موردی مطابق این قواعد ثبت نشد."
              : "دادهٔ کافی برای اجرای قواعد وجود ندارد؛ پوشش را بررسی کنید."
            : "دادهٔ بازار در دسترس نیست؛ نبود مشاهده به معنی نبود مسئله نیست."}
      </Empty>
    );
  const chart = (
    <>
      <div className={s.chartStage}>
        {data.chart.state === "ready" ? (
          <IndexTrendChart series={series} height={220} />
        ) : (
          <Empty>
            {data.chart.reason ?? "تاریخچهٔ شاخص هنوز ثبت نشده است."}
          </Empty>
        )}
      </div>
      <details className={s.note}>
        <summary>
          منبع و زمان تاریخچه · آخرین نقطه:{" "}
          {data.chart.data
            .map(
              (row) =>
                `${row.faName}: ${toPersianDigits(row.points.at(-1)?.jdate ?? "—")}`,
            )
            .join(" · ") || "ثبت نشده"}
        </summary>
        منبع: تاریخچهٔ شاخص، یک نقطه به‌ازای پایان هر روز معاملاتی.
        <br />
        زمان دریافت تاریخچه ثبت نشده · خواندن صفحه: {stamp(data.readAt)}
      </details>
    </>
  );
  return (
    <div
      dir="rtl"
      className={`${s.workspace} ${s[`layout${prefs.draft.layout}`]}`}
    >
      <header className={s.heading}>
        <div>
          <p className={s.eyebrow}>میز تحلیل آرش</p>
          <h1>بازار، با تصویر روشن‌تر</h1>
          <p>مشاهدهٔ بازار و شواهد پژوهش، در یک میز شخصی</p>
        </div>
        <div className={s.actions}>
          <button
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
          >
            <RefreshCw size={16} aria-hidden />
            {refreshing ? "در حال بازخوانی…" : "بازخوانی داده"}
          </button>
          <button onClick={() => setSettings(true)}>
            <Settings2 size={16} aria-hidden />
            شخصی‌سازی میز
          </button>
        </div>
      </header>
      <nav className={s.toolbar} aria-label="چیدمان میز">
        <div className={s.tabs}>
          {LAYOUTS.map((name, index) => (
            <button
              key={name}
              disabled={prefs.loading || prefs.saving}
              aria-pressed={prefs.draft.layout === index + 1}
              onClick={() => layout((index + 1) as DeskLayout)}
            >
              <LayoutDashboard size={15} aria-hidden />
              {name}
            </button>
          ))}
        </div>
        <span className={s.note}>
          {prefs.loading
            ? "خواندن تنظیمات حساب…"
            : dirty
              ? "تغییر ذخیره‌نشده"
              : prefs.receipt
                ? "چیدمان حساب شما"
                : "چیدمان موقت"}
        </span>
        <Link href="/admin/desk?classic=1">
          گردش کار هوشمندی <ArrowUpLeft size={14} aria-hidden />
        </Link>
      </nav>
      {prefs.message && (
        <p role="status" className={s.notice}>
          {prefs.message}
        </p>
      )}
      {dirty && (
        <div className={s.notice}>
          این انتخاب هنوز در حساب ذخیره نشده است.{" "}
          <button
            disabled={prefs.saving || prefs.loading}
            onClick={() => void prefs.save()}
          >
            {prefs.saving ? "در حال ذخیره…" : "ذخیره در حساب"}
          </button>
        </div>
      )}
      <div className={s.grid}>
        {show("market") && (
          <Panel
            id="market"
            title="وضعیت بازار"
            subtitle={qualityLabel(quality.state)}
            action={
              <Link href="/market">
                بازار <ArrowUpLeft size={16} aria-hidden />
              </Link>
            }
          >
            <div className={s.metrics}>
              {[
                ["شاخص کل", indices?.total],
                ["شاخص هم‌وزن", indices?.equalWeight],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <span>{label}</span>
                  <strong>
                    {typeof value === "number" && Number.isFinite(value)
                      ? formatCount(value)
                      : "—"}
                  </strong>
                  <small>واحد: واحد شاخص</small>
                </div>
              ))}
              <div className={s.source}>
                <span>زمان منبع شاخص</span>
                <strong className={s.sourceDate}>
                  {indices?.date
                    ? toPersianDigits(`${indices.date} ${indices.time ?? ""}`)
                    : "ثبت نشده"}
                </strong>
                <small>
                  دریافت:{" "}
                  {stamp(
                    quality.families
                      ? quality.families.indices.receivedAt
                      : quality.receivedAt,
                  )}
                </small>
              </div>
            </div>
            <p className={s.note}>
              منبع: فید بازار ایران · خواندن بازار: {stamp(quality.readAt)} ·
              وضعیت شاخص:{" "}
              {quality.families
                ? marketQualityLabel(quality.families.indices.state)
                : "نامشخص"}{" "}
              · صندوق‌ها:{" "}
              {quality.families
                ? marketQualityLabel(quality.families.funds.state)
                : "نامشخص"}{" "}
              · سهام:{" "}
              {quality.families
                ? marketQualityLabel(quality.families.stocks.state)
                : "نامشخص"}
            </p>
          </Panel>
        )}
        {show("chart") && (
          <Panel
            id="chart"
            title="روند بازار"
            subtitle="شاخص کل و هم‌وزن؛ مقدار واقعی شاخص"
            action={
              <button
                aria-label="بازکردن جزئیات نمودار"
                onClick={() => open("روند بازار", chart)}
              >
                <LineChart size={17} aria-hidden />
              </button>
            }
          >
            <div className={s.ranges} aria-label="تعداد نقاط نمودار">
              {[30, 90, 180].map((n) => (
                <button
                  key={n}
                  aria-pressed={range === n}
                  onClick={() => setRange(n)}
                >
                  {formatCount(n)} نقطه
                </button>
              ))}
            </div>
            {chart}
          </Panel>
        )}
        {show("alerts") && (
          <Panel
            id="alerts"
            title="هشدارهای داده"
            subtitle="محدودیت داده پیش از برداشت تحلیلی"
            action={<ShieldAlert size={18} aria-hidden />}
          >
            {quality.state !== "ready" && (
              <p className={s.notice}>
                بازار: {qualityLabel(quality.state)}؛ زمان و کیفیت هر خانواده را
                جدا بررسی کنید.
              </p>
            )}
            {observationList(observations.alerts)}
            <details className={s.coverage}>
              <summary>پوشش قواعد و داده‌های ناکافی</summary>
              {engine.coverage.map((row) => (
                <p key={row.kind}>
                  {RULE_LABELS[row.kind]}: {formatCount(row.examined)} بررسی از{" "}
                  {formatCount(row.candidates)} نامزد
                  {row.blocked ? ` · ${row.blocked}` : ""}
                </p>
              ))}
              <p>ابزار فاقد دادهٔ پایه: {formatCount(engine.unusable)}</p>
            </details>
          </Panel>
        )}
        {show("opportunities") && (
          <Panel
            id="opportunities"
            title="موارد قابل بررسی"
            subtitle="مشاهدات توصیفی قواعد فعلی بازار"
          >
            {observationList(observations.opportunities)}
          </Panel>
        )}
        {show("reports") && (
          <Panel
            id="reports"
            title="گزارش شرکت‌ها"
            subtitle="۲۰ اطلاعیهٔ اخیرِ قابل خواندن؛ فرادادهٔ کدال"
            action={<FileText size={18} aria-hidden />}
          >
            <div className={s.filters}>
              <label>
                <span className={s.sr}>جست‌وجوی گزارش</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="نماد یا عنوان گزارش…"
                  type="search"
                />
              </label>
              <label>
                <span className={s.sr}>دستهٔ گزارش</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="">همهٔ دسته‌ها</option>
                  {categories.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            </div>
            {data.reports.state === "unavailable" ? (
              <Empty>{data.reports.reason}</Empty>
            ) : reports.length ? (
              <ul className={s.list} data-scroll-container>
                {reports.map((row) => (
                  <li key={row.id}>
                    <button
                      className={s.row}
                      onClick={() =>
                        open(
                          row.symbol,
                          <>
                            <h3>{row.title}</h3>
                            <p>{row.category ?? "دسته ثبت نشده"}</p>
                            <dl className={s.facts}>
                              <div>
                                <dt>ارسال در منبع</dt>
                                <dd>
                                  {row.sourceDate
                                    ? toPersianDigits(
                                        `${row.sourceDate} ${row.sourceTime ?? ""}`,
                                      )
                                    : "ثبت نشده"}
                                </dd>
                              </div>
                              <div>
                                <dt>ثبت در سکو</dt>
                                <dd>{stamp(row.recordedAt)}</dd>
                              </div>
                              <div>
                                <dt>خواندن صفحه</dt>
                                <dd>{stamp(data.readAt)}</dd>
                              </div>
                            </dl>
                            <p className={s.note}>
                              این فید فرادادهٔ اطلاعیه است؛ استخراج صورت مالی از
                              نمایش این کارت اثبات نمی‌شود.
                            </p>
                            {row.url ? (
                              <a
                                href={row.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                مشاهده در کدال
                              </a>
                            ) : (
                              <p>پیوند معتبر منبع در دسترس نیست.</p>
                            )}
                          </>,
                        )
                      }
                    >
                      <span className={s.symbol}>{row.symbol}</span>
                      <span>
                        <strong>{row.title}</strong>
                        <small>
                          ارسال منبع:{" "}
                          {row.sourceDate
                            ? toPersianDigits(row.sourceDate)
                            : "ثبت نشده"}
                        </small>
                      </span>
                      <ArrowUpLeft size={16} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                {data.reports.data.length
                  ? "گزارشی مطابق این فیلتر نیست."
                  : "اطلاعیه‌ای در دسترس این نشست ثبت نشده است."}
              </Empty>
            )}
            <Link className={s.more} href="/codal">
              همهٔ اطلاعیه‌ها <ArrowUpLeft size={14} aria-hidden />
            </Link>
          </Panel>
        )}
        {show("research") && (
          <Panel
            id="research"
            title="پژوهش موجود"
            subtitle="پیش‌نویس‌های ذخیره‌شده؛ تأیید نهایی نشده"
            action={
              <Link href="/admin/research">
                پژوهش <ArrowUpLeft size={16} aria-hidden />
              </Link>
            }
          >
            {data.research.unavailableReason && (
              <Empty>{data.research.unavailableReason}</Empty>
            )}
            {data.research.drafts.length ? (
              <div className={s.researchCards}>
                {data.research.drafts.slice(0, 3).map((row) => (
                  <button
                    key={row.id}
                    className={s.researchCard}
                    onClick={() =>
                      open(
                        "پیش‌نویس پژوهش",
                        <>
                          <p className={s.notice}>پیش‌نویس؛ تأیید نهایی نشده</p>
                          <p>{row.body.summary}</p>
                          <h3>گزاره‌ها</h3>
                          {row.body.claims.map((claim, index) => (
                            <p key={index}>
                              <b>
                                {claim.kind === "FACT"
                                  ? "واقعیت گزارش‌شده"
                                  : "استنباط"}
                                :{" "}
                              </b>
                              {claim.text}{" "}
                              <small>({claim.evidence.join("، ")})</small>
                            </p>
                          ))}
                          <h3>سناریوها و شرط ابطال</h3>
                          {row.body.scenarios.map((scenario, index) => (
                            <div key={index}>
                              <p>{scenario.text}</p>
                              <p>ابطال: {scenario.invalidation}</p>
                              <small>{scenario.evidence.join("، ")}</small>
                            </div>
                          ))}
                          <h3>محدودیت‌ها</h3>
                          {row.body.limitations.map((line, index) => (
                            <p key={index}>{line}</p>
                          ))}
                          <h3>شواهد منبع</h3>
                          {row.provenance.map((source) => (
                            <div className={s.evidence} key={source.evidence}>
                              <a
                                href={source.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {source.symbol} · {source.evidence}
                              </a>
                              <p>
                                پایان دوره: {toPersianDigits(source.periodEnd)}{" "}
                                · طول دوره: {formatCount(source.periodMonths)}{" "}
                                ماه · واحد: {source.unit} · دامنه:{" "}
                                {source.scope}
                              </p>
                              <p>
                                انتشار منبع: {stamp(source.publishedAt)}
                                <br />
                                دریافت: {stamp(source.fetchedAt)}
                                <br />
                                ثبت شاهد: {stamp(source.capturedAt)}
                              </p>
                            </div>
                          ))}
                          <p className={s.note}>
                            ثبت پیش‌نویس: {stamp(row.createdAt)} · خواندن صفحه:{" "}
                            {stamp(data.readAt)}
                          </p>
                        </>,
                      )
                    }
                  >
                    <span className={s.badge}>پیش‌نویس</span>
                    <p>{row.body.summary}</p>
                    <small>{stamp(row.createdAt)}</small>
                    <span className={s.more}>
                      شواهد و جزئیات <ArrowUpLeft size={14} aria-hidden />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              !data.research.unavailableReason && (
                <Empty>پیش‌نویس قابل خواندنی در این نشست ثبت نشده است.</Empty>
              )
            )}
            {data.research.invalidCount > 0 && (
              <p className={s.notice}>
                {formatCount(data.research.invalidCount)} پیش‌نویس به دلیل
                ساختار نامعتبر نمایش داده نشد.
              </p>
            )}
          </Panel>
        )}
      </div>
      {prefs.draft.hiddenTools.length === DESK_TOOLS.length && (
        <Empty>
          ابزارها پنهان شده‌اند. از «شخصی‌سازی میز» نمایششان را برگردانید.
        </Empty>
      )}
      <dialog
        ref={dialog}
        className={s.dialog}
        aria-labelledby="desk-detail-title"
        onClose={() => {
          restore.current?.();
          restore.current = null;
          setDetail(null);
        }}
      >
        <header>
          <h2 id="desk-detail-title">{detail?.title}</h2>
          <button onClick={close} aria-label="بستن جزئیات">
            <X size={20} aria-hidden />
          </button>
        </header>
        <div className={s.dialogBody}>{detail?.body}</div>
      </dialog>
      {settings && (
        <SettingsDialog prefs={prefs} onClose={() => setSettings(false)} />
      )}
    </div>
  );
}

function SettingsDialog({
  prefs,
  onClose,
}: {
  prefs: ReturnType<typeof useDeskAccountPreferences>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  // Native dialog supplies focus containment, Escape, and focus return.
  const mount = (node: HTMLDialogElement | null) => {
    ref.current = node;
    if (node && !node.open) node.showModal();
  };
  return (
    <dialog
      ref={mount}
      className={s.dialog}
      aria-labelledby="desk-settings-title"
      onClose={onClose}
    >
      <header>
        <div>
          <h2 id="desk-settings-title">میز شما، با هر سه چیدمان</h2>
          <p>انتخاب فقط نحوهٔ نمایش را تغییر می‌دهد.</p>
        </div>
        <button
          aria-label="بستن شخصی‌سازی"
          onClick={() => ref.current?.close()}
        >
          <X size={20} aria-hidden />
        </button>
      </header>
      <div className={s.dialogBody}>
        <fieldset className={s.choices}>
          <legend>چیدمان</legend>
          {LAYOUTS.map((name, i) => (
            <label key={name}>
              <input
                type="radio"
                disabled={prefs.loading || prefs.saving}
                name="desk-layout"
                checked={prefs.draft.layout === i + 1}
                onChange={() =>
                  prefs.setDraft((value) => ({
                    ...value,
                    layout: (i + 1) as DeskLayout,
                  }))
                }
              />
              <span>
                <strong>{name}</strong>
                <small>
                  {
                    [
                      "نمودار در مرکز، گزارش‌ها در دسترس",
                      "مشاهدات در کنار نمودار و شواهد",
                      "هشدارهای داده با اولویت دیداری",
                    ][i]
                  }
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className={s.choices}>
          <legend>نمایش ابزارهای متصل</legend>
          {DESK_TOOLS.map((tool) => (
            <label key={tool}>
              <input
                type="checkbox"
                disabled={prefs.loading || prefs.saving}
                checked={!prefs.draft.hiddenTools.includes(tool)}
                onChange={(event) =>
                  prefs.setDraft((value) => ({
                    ...value,
                    hiddenTools: event.target.checked
                      ? value.hiddenTools.filter((item) => item !== tool)
                      : [...value.hiddenTools, tool],
                  }))
                }
              />
              {TOOL_LABELS[tool]}
            </label>
          ))}
        </fieldset>
        <p className={s.note}>
          پنهان‌کردن ابزار، مجوز دسترسی را تغییر نمی‌دهد. هر سه طرح از همان داده
          و محاسبات استفاده می‌کنند.
        </p>
        <p role="status">
          {prefs.message ??
            (prefs.loading
              ? "خواندن حساب…"
              : prefs.receipt
                ? `نسخهٔ تنظیمات: ${formatCount(prefs.receipt.revision)} · آخرین ذخیره: ${stamp(prefs.receipt.updatedAt)}`
                : "تنظیمات حساب تأیید نشده؛ انتخاب فعلی موقت است.")}
        </p>
        <div className={s.actions}>
          <button
            disabled={!prefs.receipt || prefs.loading || prefs.saving}
            onClick={() => void prefs.save()}
          >
            {prefs.saving ? "در حال ذخیره…" : "ذخیره در حساب"}
          </button>
          <button
            disabled={!prefs.receipt || prefs.loading || prefs.saving}
            onClick={() => void prefs.reset()}
          >
            بازگشت به پیش‌فرض
          </button>
          <button
            disabled={prefs.saving || prefs.loading}
            onClick={() => void prefs.reload()}
          >
            بازخوانی تنظیمات حساب
          </button>
        </div>
      </div>
    </dialog>
  );
}
