import type { MetadataRoute } from "next";

import { FIGURES } from "@/lib/scripture/figures";
import { SITE_URL } from "@/lib/telegram";

import { readablePeople } from "./people";

/** Every public page, so search engines can find each person's story. */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number, changeFrequency: "daily" | "monthly" = "monthly") => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  });
  return [
    page("/", 1, "daily"),
    page("/people", 0.9),
    page("/help", 0.8),
    ...readablePeople(FIGURES).map((f) => page(`/people/${f.id}`, 0.7)),
    page("/credits", 0.3),
  ];
}
