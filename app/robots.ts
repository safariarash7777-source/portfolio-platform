import type { MetadataRoute } from "next";
import { resolveAppUrl } from "@/lib/site-url";

const base = resolveAppUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/api"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
