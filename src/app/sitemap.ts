import type { MetadataRoute } from "next";

import { FIGURES } from "@/lib/scripture/figures";
import { SITE_URL } from "@/lib/telegram";

import { readablePeople } from "./people";

/**
 * Every public page in both languages, so search engines find each person's
 * story in English and in Amharic. Pages choose their language from ?lang=
 * (see middleware.ts); the bare address follows the reader's own setting.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths: [string, number, "daily" | "monthly"][] = [
    ["/", 1, "daily"],
    ["/people", 0.9, "monthly"],
    ["/help", 0.8, "monthly"],
    ...readablePeople(FIGURES).map((f): [string, number, "monthly"] => [`/people/${f.id}`, 0.7, "monthly"]),
    ["/credits", 0.3, "monthly"],
  ];
  return paths.flatMap(([path, priority, changeFrequency]) => {
    const languages = { en: `${SITE_URL}${path}?lang=en`, am: `${SITE_URL}${path}?lang=am` };
    return (["en", "am"] as const).map((lang) => ({
      url: languages[lang],
      changeFrequency,
      priority,
      alternates: { languages },
    }));
  });
}
