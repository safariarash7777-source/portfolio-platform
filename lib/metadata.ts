/**
 * Shared metadata helper for public pages — P2-MANUS-MEGA-002
 *
 * Next.js performs a SHALLOW merge of the `openGraph` object, so every page
 * that exports its own `openGraph` must repeat `locale`, `siteName`, and `type`
 * or those root-layout values will be lost.  This helper centralises those
 * shared fields so they can never drift.
 *
 * Usage:
 *   import { pageMetadata } from "@/lib/metadata";
 *   export const metadata = pageMetadata({
 *     title: "عنوان صفحه",
 *     description: "توضیح صفحه",
 *     path: "/market",
 *   });
 */

import type { Metadata } from "next";

interface PageMetadataOptions {
  /** Page title — will be combined with root template "%s · آرش صفری" */
  title: string;
  /** Full meta description for the page (120–160 chars recommended) */
  description: string;
  /** Relative path, e.g. "/market" — metadataBase in root layout resolves the full URL */
  path: string;
  /** Optional override for OG title (defaults to title) */
  ogTitle?: string;
  /** Optional override for OG description (defaults to description) */
  ogDescription?: string;
}

/** Shared OG fields that must be present on every page to survive shallow merge */
const OG_SHARED = {
  locale: "fa_IR",
  type: "website" as const,
  siteName: "Arash Safari",
};

export function pageMetadata({
  title,
  description,
  path,
  ogTitle,
  ogDescription,
}: PageMetadataOptions): Metadata {
  return {
    title,
    description,
    openGraph: {
      ...OG_SHARED,
      title: ogTitle ?? `${title} · آرش صفری`,
      description: ogDescription ?? description,
      url: path, // relative — metadataBase in root layout resolves to full URL
    },
  };
}
