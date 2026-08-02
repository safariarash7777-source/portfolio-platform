/**
 * Default OpenGraph image — P2-MANUS-MEGA-002 (final)
 *
 * Approach: serve a pre-rendered static PNG from public/og-default.png.
 *
 * Why static PNG instead of ImageResponse:
 * - satori (the engine behind ImageResponse) does NOT support Arabic/Persian
 *   shaping (HarfBuzz) — Persian text renders with broken/reversed characters.
 * - The static PNG was rendered with Chromium + Vazirmatn font, verified to
 *   show correct RTL Persian text at 1200×630.
 * - QA evidence: docs/assets/public-experience/og-image-qa.png
 *
 * Next.js serves files from public/ at the root path, so /og-default.png
 * is available as https://arashsafari.ir/og-default.png once deployed.
 * metadataBase in root layout resolves the relative URL automatically.
 */
import type { Metadata } from "next";

// This file is intentionally NOT an ImageResponse route.
// The OG image is declared in root layout metadata instead.
// See app/layout.tsx → metadata.openGraph.images

export const metadata: Metadata = {};

export default function OGImagePlaceholder() {
  return null;
}
