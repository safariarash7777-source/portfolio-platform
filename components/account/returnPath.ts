/**
 * مسیر بازگشت فقط می‌تواند یک مسیر محلیِ همان سایت باشد.
 * این helper در لایهٔ UI است و هیچ تصمیمی دربارهٔ مجوز کاربر نمی‌گیرد.
 */
export function normalizeReturnPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value || value.length > 2048) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}

export function accountEntryHref(
  entry: "/login" | "/register",
  returnTo: string,
): string {
  return `${entry}?next=${encodeURIComponent(normalizeReturnPath(returnTo))}`;
}
