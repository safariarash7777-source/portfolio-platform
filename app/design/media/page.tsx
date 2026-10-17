import MediaHub from "@/components/insights/MediaHub";
import snapshot from "@/lib/media/public-snapshot.json";
import { isPlatform, isKind } from "@/lib/content-hub";
import type { MediaItem } from "@/lib/media/presentation";
export const metadata = { title: "رسانهٔ آرش · پیش‌نمایش سه طرح", robots: { index: false, follow: false } };
export default function MediaPreviewPage() {
  const items: MediaItem[] = snapshot.filter(row => isPlatform(row.platform) && isKind(row.kind)).map(row => ({ ...row, platform: isPlatform(row.platform) ? row.platform : "telegram", kind: isKind(row.kind) ? row.kind : "post" }));
  return <MediaHub items={items} preview />;
}
