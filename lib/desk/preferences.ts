/** Presentation only. This list never grants access to a tool or to its data. */
export const DESK_TOOLS = [
  "market",
  "chart",
  "opportunities",
  "alerts",
  "reports",
  "research",
] as const;
export type DeskTool = (typeof DESK_TOOLS)[number];
export type DeskLayout = 1 | 2 | 3;
export interface DeskPreferences {
  schemaVersion: 1;
  layout: DeskLayout;
  hiddenTools: DeskTool[];
}
export interface DeskPreferenceReceipt {
  preferences: DeskPreferences;
  revision: number;
  updatedAt: string | null;
  allowedTools: DeskTool[];
}
export const DESK_DEFAULTS: DeskPreferences = {
  schemaVersion: 1,
  layout: 1,
  hiddenTools: [],
};
export const TOOL_LABELS: Record<DeskTool, string> = {
  market: "وضعیت بازار",
  chart: "روند شاخص",
  opportunities: "موارد قابل بررسی",
  alerts: "هشدارهای داده",
  reports: "گزارش شرکت‌ها",
  research: "پژوهش موجود",
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_preferences");
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error("invalid_preferences");
}
export function parseDeskPreferences(value: unknown): DeskPreferences {
  const v = record(value);
  exact(v, ["schemaVersion", "layout", "hiddenTools"]);
  if (
    v.schemaVersion !== 1 ||
    ![1, 2, 3].includes(v.layout as number) ||
    !Array.isArray(v.hiddenTools) ||
    v.hiddenTools.length > DESK_TOOLS.length ||
    v.hiddenTools.some(
      (item) => !(DESK_TOOLS as readonly unknown[]).includes(item),
    ) ||
    new Set(v.hiddenTools).size !== v.hiddenTools.length
  )
    throw new Error("invalid_preferences");
  return {
    schemaVersion: 1,
    layout: v.layout as DeskLayout,
    hiddenTools: [...v.hiddenTools] as DeskTool[],
  };
}
export function parseDeskPreferenceWrite(
  value: unknown,
): DeskPreferences & { expectedRevision: number } {
  const v = record(value);
  exact(v, ["schemaVersion", "layout", "hiddenTools", "expectedRevision"]);
  if (
    !Number.isSafeInteger(v.expectedRevision) ||
    Number(v.expectedRevision) < 0
  )
    throw new Error("invalid_revision");
  return {
    ...parseDeskPreferences({
      schemaVersion: v.schemaVersion,
      layout: v.layout,
      hiddenTools: v.hiddenTools,
    }),
    expectedRevision: Number(v.expectedRevision),
  };
}
export function parseDeskPreferenceReceipt(
  value: unknown,
): DeskPreferenceReceipt {
  const v = record(value);
  exact(v, ["preferences", "revision", "updatedAt", "allowedTools"]);
  const preferences = parseDeskPreferences(v.preferences);
  if (
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 0 ||
    !Array.isArray(v.allowedTools) ||
    v.allowedTools.length !== DESK_TOOLS.length ||
    new Set(v.allowedTools).size !== DESK_TOOLS.length ||
    v.allowedTools.some(
      (item) => !(DESK_TOOLS as readonly unknown[]).includes(item),
    )
  )
    throw new Error("invalid_receipt");
  if (
    v.revision === 0
      ? v.updatedAt !== null
      : typeof v.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(v.updatedAt))
  )
    throw new Error("invalid_receipt");
  return {
    preferences,
    revision: Number(v.revision),
    updatedAt: v.updatedAt as string | null,
    allowedTools: [...v.allowedTools] as DeskTool[],
  };
}
