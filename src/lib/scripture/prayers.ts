/**
 * Short prayers of repentance, quoted word for word from the World English
 * Bible chunks in the corpus (each `chunkId` holds every `lines` entry
 * verbatim — checked by SQL when added). Shown under a story and on person
 * pages, chosen by the struggle, so a reader has something to pray next.
 */
export interface Prayer {
  id: "psalm51" | "tax_collector" | "manasseh";
  chunkId: string;
  ref: string;
  /** How the passage is found in an Amharic (Ethiopian) Bible; Psalms are numbered one lower there. */
  refAm: string;
  lines: string[];
}

export const PRAYERS: Prayer[] = [
  {
    id: "psalm51",
    chunkId: "bf176786-2fe6-4b80-9d92-cdc4bab7c2d9",
    ref: "Psalm 51:1–2, 10–12",
    refAm: "መዝሙረ ዳዊት 50 (51)፥ 1–2፣ 10–12",
    lines: [
      "Have mercy on me, God, according to your loving kindness. According to the multitude of your tender mercies, blot out my transgressions. Wash me thoroughly from my iniquity. Cleanse me from my sin.",
      "Create in me a clean heart, O God. Renew a right spirit within me. Don’t throw me from your presence, and don’t take your Holy Spirit from me. Restore to me the joy of your salvation.",
    ],
  },
  {
    id: "tax_collector",
    chunkId: "631a4e71-6116-484e-903c-bb9d93ebbebc",
    ref: "Luke 18:13",
    refAm: "ሉቃስ 18፥13",
    lines: ["God, be merciful to me, a sinner!"],
  },
  {
    id: "manasseh",
    chunkId: "3f81f798-f857-474a-9091-988ffba65553",
    ref: "Prayer of Manasseh 12–14",
    refAm: "ጸሎተ ምናሴ 12–14",
    lines: [
      "I have sinned, O Lord, I have sinned, and I acknowledge my iniquities; but, I humbly ask you, forgive me, O Lord, forgive me, and please don’t destroy me with my iniquities.",
      "For you, O Lord, are the God of those who repent. In me you will show all your goodness, for you will save me, even though I am unworthy, according to your great mercy.",
    ],
  },
];

const byId = (id: Prayer["id"]) => PRAYERS.find((p) => p.id === id)!;

/**
 * Manasseh's prayer for those who think they are too far gone; the tax
 * collector's for pride and judging others; David's psalm for everything else.
 */
export function prayerFor(tags: readonly string[], figureId?: string): Prayer {
  if (figureId === "david") return byId("psalm51");
  if (figureId === "manasseh" || tags.some((t) => t === "despair" || t === "shame")) return byId("manasseh");
  if (tags.some((t) => t === "pride" || t === "hypocrisy" || t === "resentment")) return byId("tax_collector");
  return byId("psalm51");
}
