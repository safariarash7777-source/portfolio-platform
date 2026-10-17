import {
  sitePreviewHref,
  type SiteLayout,
  type SiteAppearancePath,
} from "@/lib/appearance/site-layout";
export type PublicLayout = SiteLayout;

/** Parse a presentation value only after server-authorized administrator preview. */
export function publicLayout(
  value: string | string[] | undefined,
): PublicLayout {
  return value === "2" ? 2 : value === "3" ? 3 : 1;
}

export function publicLayoutHref(
  path: SiteAppearancePath,
  layout: PublicLayout,
  preview = false,
): string {
  return preview ? sitePreviewHref(path, layout) : path;
}
