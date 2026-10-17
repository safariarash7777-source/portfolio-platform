import type { MediaLayout } from "./presentation";
import { isSiteLayout } from "@/lib/appearance/site-layout";

export const isMediaLayout = isSiteLayout;

export function mediaLayoutInput(value: unknown): MediaLayout | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = Object.keys(value);
  if (fields.length !== 1 || fields[0] !== "media_layout") return null;
  const layout = (value as { media_layout?: unknown }).media_layout;
  return isMediaLayout(layout) ? layout : null;
}
