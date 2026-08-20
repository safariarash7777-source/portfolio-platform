import { toPersianDigits } from "@/lib/format";
import { DATA_STATE_LABEL, type DeskView } from "@/lib/desk/contracts";
import { DIRECTION_LABEL } from "@/lib/intelligence/workflow";
import type { IntelligenceDeskViewModel } from "@/lib/intelligence/board";

export const COMMAND_QUESTION_KEYS = [
  "happened",
  "meaning",
  "markets",
  "scenarios",
  "portfolio",
  "decisions",
] as const;

export type CommandQuestionKey = (typeof COMMAND_QUESTION_KEYS)[number];
export type CommandQuestionState = "ready" | "attention" | "empty" | "loading" | "unavailable";

export interface CommandQuestion {
  key: CommandQuestionKey;
  order: number;
  question: string;
  answer: string;
  detail: string;
  state: CommandQuestionState;
  facts: readonly string[];
  href: string;
  linkLabel: string;
}

export interface CommandDeskStatus {
  data: DeskView | null;
  loading: boolean;
  error: string | null;
}

const fa = (value: number | string) => toPersianDigits(String(value));

/**
 * شش پاسخِ روزانه از قراردادهای موجود ساخته می‌شوند؛ این تابع تحلیل یا عدد
 * تازه تولید نمی‌کند. نبودِ بریف، شاهد، سناریو، وزن یا منبع در خروجی همان
 * نبودن می‌ماند و با صفرِ ساختگی پوشانده نمی‌شود.
 */
export function buildCommandQuestions(
  view: IntelligenceDeskViewModel,
  desk: CommandDeskStatus
): CommandQuestion[] {
  const intelligenceUnavailable = view.unavailableReason !== null;
  const todayClaims = view.today.claims;
  const supportedClaims = todayClaims.filter((claim) => claim.evidenceCount > 0);
  const scenarioClaims = view.scenarios.flatMap((scenario) => scenario.claims);
  const unsupportedScenarios = view.scenarios.reduce((sum, scenario) => sum + scenario.unsupported, 0);
  const portfolioEffects = view.portfolio.rows.filter((row) => row.direction !== null);
  const blockedDecisions = view.inbox.filter((item) => item.blockedReason !== null);

  const happened: CommandQuestion = intelligenceUnavailable
    ? {
        key: "happened", order: 1, question: "امروز چه اتفاقی افتاده؟",
        answer: "گردش هوشمندی در دسترس نیست",
        detail: view.unavailableReason!, state: "unavailable", facts: [],
        href: "#intelligence-workflow", linkLabel: "دیدن وضعیت گردش",
      }
    : view.today.brief
      ? {
          key: "happened", order: 1, question: "امروز چه اتفاقی افتاده؟",
          answer: view.today.brief.title,
          detail: `بریف ${view.todayJalali} با وضعیت «${view.today.statusLabel}» ثبت شده است.`,
          state: view.today.unsupportedClaims > 0 ? "attention" : "ready",
          facts: [], href: "#intelligence-workflow", linkLabel: "بازکردن بریف امروز",
        }
      : {
          key: "happened", order: 1, question: "امروز چه اتفاقی افتاده؟",
          answer: "بریف امروز هنوز ثبت نشده",
          detail: "نبودِ بریف با یک روز آرام یکی نیست؛ برای امروز هنوز جمع‌بندی ثبت‌شده‌ای نداریم.",
          state: "empty", facts: [], href: "#intelligence-workflow", linkLabel: "رفتن به گردش دستی",
        };

  const meaning: CommandQuestion = intelligenceUnavailable
    ? {
        key: "meaning", order: 2, question: "چرا این رخدادها مهم‌اند؟",
        answer: "شاهد و گزاره قابل خواندن نیست",
        detail: view.unavailableReason!, state: "unavailable", facts: [],
        href: "#intelligence-workflow", linkLabel: "دیدن جزئیات",
      }
    : !view.today.brief
      ? {
          key: "meaning", order: 2, question: "چرا این رخدادها مهم‌اند؟",
          answer: "هنوز گزاره‌ای برای امروز نداریم",
          detail: "اول بریف و شواهد امروز باید ثبت شوند؛ سیستم دلیل را حدس نمی‌زند.",
          state: "empty", facts: [], href: "#intelligence-workflow", linkLabel: "ثبت بریف",
        }
      : todayClaims.length === 0
        ? {
            key: "meaning", order: 2, question: "چرا این رخدادها مهم‌اند؟",
            answer: "بریف امروز گزاره‌ای ندارد",
            detail: "عنوان ثبت شده، اما هنوز گزارهٔ قابل بررسی به آن متصل نشده است.",
            state: "empty", facts: [], href: "#intelligence-workflow", linkLabel: "تکمیل بریف",
          }
        : {
            key: "meaning", order: 2, question: "چرا این رخدادها مهم‌اند؟",
            answer: view.today.unsupportedClaims > 0
              ? `${fa(view.today.unsupportedClaims)} گزاره هنوز شاهد کامل ندارد`
              : `${fa(supportedClaims.length)} گزاره با شاهد ثبت شده است`,
            detail: "این‌ها گزاره‌های ثبت‌شدهٔ امروزند؛ متن تازه یا نتیجه‌گیری خودکار تولید نشده است.",
            state: view.today.unsupportedClaims > 0 ? "attention" : "ready",
            facts: todayClaims.slice(0, 3).map((claim) => claim.statement),
            href: "#intelligence-workflow", linkLabel: "بازبینی گزاره‌ها",
          };

  const marketPanel = desk.data?.panels.find((panel) => panel.key === "today") ?? null;
  const marketFacts = [
    ...(marketPanel?.sources.map((source) => `${source.label}: ${DATA_STATE_LABEL[source.state]}`) ?? []),
    ...portfolioEffects.slice(0, 3).map((row) => `${row.label}: ${DIRECTION_LABEL[row.direction!]}`),
  ];
  const markets: CommandQuestion = desk.loading && !desk.data
    ? {
        key: "markets", order: 3, question: "بازارها و داده‌ها در چه وضعی‌اند؟",
        answer: "در حال خواندن منابع بازار",
        detail: "سلامت هر منبع جداگانه بررسی می‌شود تا یک منبع سالم، خرابی منبع دیگر را پنهان نکند.",
        state: "loading", facts: [], href: "#source-health", linkLabel: "سلامت منابع",
      }
    : desk.error || !desk.data || !marketPanel
      ? {
          key: "markets", order: 3, question: "بازارها و داده‌ها در چه وضعی‌اند؟",
          answer: "وضعیت منابع قابل خواندن نیست",
          detail: desk.error ?? "بخش بازار در پاسخ سلامت منابع وجود ندارد.",
          state: "unavailable", facts: marketFacts, href: "#source-health", linkLabel: "دیدن خطا",
        }
      : {
          key: "markets", order: 3, question: "بازارها و داده‌ها در چه وضعی‌اند؟",
          answer: marketPanel.detail,
          detail: portfolioEffects.length > 0
            ? `${fa(portfolioEffects.length)} اثرِ دارایی نیز در گردش هوشمندی ثبت شده است.`
            : "برای دارایی‌های سبد هنوز اثر تازه‌ای ثبت نشده است.",
          state: marketPanel.state === "ready"
            ? "ready"
            : marketPanel.state === "stale"
              ? "attention"
              : marketPanel.state,
          facts: marketFacts, href: "#source-health", linkLabel: "جزئیات منابع بازار",
        };

  const scenarios: CommandQuestion = intelligenceUnavailable
    ? {
        key: "scenarios", order: 4, question: "کدام سناریو تغییر کرده است؟",
        answer: "تخته سناریو در دسترس نیست",
        detail: view.unavailableReason!, state: "unavailable", facts: [],
        href: "#intelligence-workflow", linkLabel: "دیدن تخته سناریو",
      }
    : scenarioClaims.length === 0
      ? {
          key: "scenarios", order: 4, question: "کدام سناریو تغییر کرده است؟",
          answer: "سناریوی ثبت‌شده‌ای نداریم",
          detail: "سیستم تغییر سناریو را از روی خبر یا قیمت حدس نمی‌زند.",
          state: "empty", facts: [], href: "#intelligence-workflow", linkLabel: "ثبت یا بازبینی سناریو",
        }
      : {
          key: "scenarios", order: 4, question: "کدام سناریو تغییر کرده است؟",
          answer: `${fa(scenarioClaims.length)} گزاره در سه سناریو ثبت شده است`,
          detail: unsupportedScenarios > 0
            ? `${fa(unsupportedScenarios)} گزارهٔ سناریویی هنوز شاهد کامل ندارد.`
            : "تمام گزاره‌های سناریوییِ موجود شاهد دارند.",
          state: unsupportedScenarios > 0 ? "attention" : "ready",
          facts: view.scenarios
            .filter((scenario) => scenario.claims.length > 0)
            .map((scenario) => `${scenario.labelFa}: ${fa(scenario.claims.length)} گزاره`),
          href: "#intelligence-workflow", linkLabel: "بازکردن تخته سناریو",
        };

  const portfolio: CommandQuestion = intelligenceUnavailable
    ? {
        key: "portfolio", order: 5, question: "اثر احتمالی بر سبد مرجع چیست؟",
        answer: "اثر سبد قابل خواندن نیست",
        detail: view.unavailableReason!, state: "unavailable", facts: [],
        href: "#intelligence-workflow", linkLabel: "دیدن وضعیت سبد",
      }
    : !view.portfolio.hasOfficialWeights
      ? {
          key: "portfolio", order: 5, question: "اثر احتمالی بر سبد مرجع چیست؟",
          answer: "نسخهٔ نهایی سبد در سامانه ثبت نشده",
          detail: "وزن مصوب یا اثر دارایی با عدد جایگزین ساخته نمی‌شود؛ نسخه باید صریحاً نهایی شود.",
          state: "attention",
          facts: portfolioEffects.slice(0, 3).map((row) => `${row.label}: ${DIRECTION_LABEL[row.direction!]}`),
          href: "#intelligence-workflow", linkLabel: "بازبینی اثر سبد",
        }
      : portfolioEffects.length === 0
        ? {
            key: "portfolio", order: 5, question: "اثر احتمالی بر سبد مرجع چیست؟",
            answer: "سبد ثبت شده؛ اثر تازه‌ای ثبت نشده",
            detail: view.portfolio.note, state: "empty", facts: [],
            href: "#intelligence-workflow", linkLabel: "دیدن سبد مرجع",
          }
        : {
            key: "portfolio", order: 5, question: "اثر احتمالی بر سبد مرجع چیست؟",
            answer: `${fa(portfolioEffects.length)} دارایی اثر ثبت‌شده دارد`,
            detail: "اثرها پیش‌نویس تحلیلی‌اند و تصمیم نهایی فقط با آرش است.",
            state: "ready",
            facts: portfolioEffects.slice(0, 4).map((row) => `${row.label}: ${DIRECTION_LABEL[row.direction!]}`),
            href: "#intelligence-workflow", linkLabel: "بازکردن اثر سبد",
          };

  const decisions: CommandQuestion = intelligenceUnavailable
    ? {
        key: "decisions", order: 6, question: "چه چیزی منتظر تصمیم من است؟",
        answer: "صف بازبینی قابل خواندن نیست",
        detail: view.unavailableReason!, state: "unavailable", facts: [],
        href: "#intelligence-workflow", linkLabel: "دیدن صف بازبینی",
      }
    : view.inbox.length === 0
      ? {
          key: "decisions", order: 6, question: "چه چیزی منتظر تصمیم من است؟",
          answer: "موردی در صف بازبینی نیست",
          detail: "این یعنی صف فعلی خالی است؛ دربارهٔ کامل‌بودن رصد بازار ادعایی نمی‌کند.",
          state: "ready", facts: [], href: "#intelligence-workflow", linkLabel: "بازکردن گردش دستی",
        }
      : {
          key: "decisions", order: 6, question: "چه چیزی منتظر تصمیم من است؟",
          answer: `${fa(view.inbox.length)} مورد در انتظار بازبینی است`,
          detail: blockedDecisions.length > 0
            ? `${fa(blockedDecisions.length)} مورد پیش از تصمیم به تکمیل شاهد نیاز دارد.`
            : "همهٔ موارد صف از نظر شاهد آمادهٔ بازبینی انسانی‌اند.",
          state: "attention",
          facts: view.inbox.slice(0, 3).map((item) => item.brief.title),
          href: "#intelligence-workflow", linkLabel: "رسیدگی به صف",
        };

  return [happened, meaning, markets, scenarios, portfolio, decisions];
}
