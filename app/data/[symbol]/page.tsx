// T2 ممیزی — /data/[symbol] در /symbol/[symbol] ادغام شد.
// این مسیر برای سازگاری با لینک‌های قدیمی، ریدایرکت دائمی (۳۰۸) می‌دهد.

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ symbol: string }>;
}

export default async function DataSymbolRedirect({ params }: PageProps) {
  const { symbol } = await params;
  permanentRedirect(`/symbol/${encodeURIComponent(decodeURIComponent(symbol))}`);
}
