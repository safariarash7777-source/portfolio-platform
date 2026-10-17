export type PublicLayout = 1 | 2 | 3;

/** A view of this URL only. It never reads or writes any global/account setting. */
export function publicLayout(
  value: string | string[] | undefined,
): PublicLayout {
  return value === "2" ? 2 : value === "3" ? 3 : 1;
}

export function publicLayoutHref(
  path: "/" | "/market",
  layout: PublicLayout,
): string {
  return layout === 1 ? path : `${path}?design=${layout}`;
}
