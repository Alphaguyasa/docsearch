import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/telegram";

/** Index the stories; keep crawlers out of the API and the internal pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/documents", "/evals"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
