/**
 * How people are shown to readers. The seed data carries notes written for the
 * retrieval pipeline ("filter that passage by tradition", "refs are by Book");
 * readers only ever see the notes below, which say something true about the
 * text they are about to read.
 */
import type { Figure } from "@/lib/scripture/figures";

const READER_NOTES: Record<string, string> = {
  david: "Psalm 51 is Psalm 50 in Orthodox and Catholic Bibles that follow the Septuagint.",
  elijah: "Despair is not a sin in itself. Elijah's story is here because he was brought so low, and was met there.",
  woman_caught_in_adultery: "This passage (John 7:53–8:11) is not in the earliest manuscripts of John's Gospel.",
  moses_the_ethiopian: "Budge's translation of the Paradise of the Holy Fathers calls him “Moses the Indian”.",
  noah: "Scripture does not tell of Noah repenting. It tells what his drunkenness cost his family, and still names him among the faithful (Hebrews 11:7).",
  prodigal_son: "A parable Jesus told, not a historical person — told so that anyone could see themselves in him.",
  job: "Job's suffering was not a punishment for sin. He is here because he said the bitterest things to God, and God still answered him.",
  penitent_thief:
    "Luke calls him a criminal. The Church remembers him as the good thief; in the Ethiopian tradition, Fiyatawi Zeyemen, “the thief on the right”.",
  sinful_woman: "Luke does not name her. She is often identified with Mary Magdalene, but the Gospel does not say so.",
  mary_of_egypt:
    "Her story is read here from the Ethiopian Synaxarium (Miyazya). She is also honoured by Catholics and the Orthodox.",
  abba_moses_hermit: "Read from the Ethiopian Synaxarium (Maskaram). This is not Abba Moses the Black.",
  jacob_the_monk:
    "Read from the Ethiopian Synaxarium (Yakatit). His story includes the killing of two people; it is here because the text says even this was forgiven.",
  mary_niece_of_abraham: "Read from the Ethiopian Synaxarium (Nahase), in the story of her uncle, Abba Abraham.",
  martianus_woman: "Read from the Ethiopian Synaxarium (Genbot). The text does not give her name.",
  hero_of_alexandria:
    "Read from the Paradise of the Holy Fathers (Palladius), where he is called Ahron (Hero); Heron in the Lausiac History.",
  robber_captain: "Read from the Ethiopian Synaxarium (Takhsas), in the story of Abba Daniel. The text does not give his name.",
  envious_elder: "Read from the Sayings of the Fathers in the Paradise of the Holy Fathers. The text does not give his name.",
  gelasius_cook:
    "Read from the Ethiopian Synaxarium (Yakatit), in the story of Abba Gelasius. The text does not give his name.",
  martha_of_egypt: "Her story is read here from the Ethiopian Synaxarium (Sane).",
  basils_young_man:
    "The Synaxarium does not give his name; it remembers this as a miracle of St. Basil the Great (Maskaram).",
  cyprian:
    "Cyprian of Antioch, not Cyprian the bishop of Carthage. His story is read from the Ethiopian Synaxarium (Maskaram); he is also honoured by Catholics and the Orthodox.",
  manasseh: "The Prayer of Manasseh is Scripture in the Orthodox and Ethiopian Orthodox Churches.",
};

export function readerNote(f: Pick<Figure, "id">): string | undefined {
  return READER_NOTES[f.id];
}

export function tagLabel(tag: string): string {
  return tag.replace(/_/g, " ");
}

/** A passage reference fit to print: drops the opening-words locators used to find tradition texts. */
function cleanRef(ref: string): string {
  return ref.replace(/,\s*“[^”]*”\s*$/, "");
}

/** The fall and the restoration, each as "Book 1:2-3; Book 4:5". Context passages are left out. */
export function storyRefs(f: Figure): { fall: string[]; restoration: string[] } {
  const live = f.passages.filter((p) => p.sourceId !== "pending");
  const refs = (role: "fall" | "restoration") => [
    ...new Set(live.filter((p) => p.role === role).map((p) => cleanRef(p.ref))),
  ];
  return { fall: refs("fall"), restoration: refs("restoration") };
}

/** People with at least one passage in the library, i.e. whose story can actually be read. */
export function readablePeople(all: Figure[]): Figure[] {
  return all.filter((f) => f.passages.some((p) => p.sourceId !== "pending"));
}

/** Struggle groups a reader would recognise, each gathering several seed tags. */
export const GROUPS: { id: string; label: string; tags: string[] }[] = [
  { id: "lust", label: "Lust", tags: ["lust", "sexual_sin", "adultery"] },
  { id: "anger", label: "Anger & violence", tags: ["anger", "violence", "murder", "persecution", "resentment"] },
  { id: "lying", label: "Lying & gossip", tags: ["deceit", "hypocrisy", "denial", "betrayal", "gossip"] },
  { id: "pride", label: "Pride", tags: ["pride"] },
  { id: "greed", label: "Greed & theft", tags: ["greed", "theft", "exploitation", "envy"] },
  { id: "fear", label: "Fear & shame", tags: ["fear", "cowardice", "shame"] },
  { id: "away", label: "Turning away", tags: ["idolatry", "disobedience", "quitting", "abandonment"] },
  { id: "despair", label: "Despair & doubt", tags: ["despair", "doubt"] },
  { id: "addiction", label: "Addiction", tags: ["addiction"] },
];

/** The group ids a person belongs to, for their card's data-groups attribute. */
export function groupsFor(sins: string[]): string {
  return GROUPS.filter((g) => g.tags.some((t) => sins.includes(t)))
    .map((g) => g.id)
    .join(" ");
}

/** How many people fall under each group, for the filter's chip counts. */
export function groupCounts(people: Figure[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of people)
    for (const g of groupsFor(f.sins).split(" ").filter(Boolean)) counts[g] = (counts[g] ?? 0) + 1;
  return counts;
}
