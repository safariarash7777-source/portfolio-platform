export type SiteLayout = 1 | 2 | 3;
export const SITE_LAYOUTS = [1, 2, 3] as const;
export const SITE_APPEARANCE_PATHS = ["/", "/market", "/insights"] as const;
export type SiteAppearancePath = (typeof SITE_APPEARANCE_PATHS)[number];
export type SiteAppearance =
  | {
      state: "ready";
      globalLayout: SiteLayout;
      previewLayout: SiteLayout | null;
    }
  | { state: "unavailable"; globalLayout: null; previewLayout: null };

export const isSiteLayout = (value: unknown): value is SiteLayout =>
  value === 1 || value === 2 || value === 3;
export function requestedPreviewLayout(value: unknown): SiteLayout | null {
  return value === "1" ? 1 : value === "2" ? 2 : value === "3" ? 3 : null;
}
export function sitePreviewHref(
  path: SiteAppearancePath,
  layout: SiteLayout,
): string {
  return `${path}?appearance_preview=1&design=${layout}`;
}
