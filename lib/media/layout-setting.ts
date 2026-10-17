import type { MediaLayout } from "./presentation";

export const isMediaLayout = (value: unknown): value is MediaLayout => value === 1 || value === 2 || value === 3;

export function mediaLayoutInput(value: unknown): MediaLayout | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = Object.keys(value);
  if (fields.length !== 1 || fields[0] !== "media_layout") return null;
  const layout = (value as { media_layout?: unknown }).media_layout;
  return isMediaLayout(layout) ? layout : null;
}
