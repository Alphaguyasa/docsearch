/**
 * "40 days, 40 people who came back": one person a day, in an order that
 * moves from recognising yourself, through deep falls and long exile, to the
 * desert saints and the thief promised Paradise on the last day. Progress is
 * kept only in the reader's own browser (see JourneyProgress).
 */
export const JOURNEY: readonly string[] = [
  // 1. You are not the only one
  "prodigal_son", "david", "peter", "samaritan_woman", "zacchaeus", "jonah", "woman_caught_in_adultery",
  // 2. What we hide
  "jacob", "abraham", "rahab", "matthew", "sinful_woman", "moses", "aaron",
  // 3. Deep falls
  "samson", "manasseh", "nebuchadnezzar", "judah", "miriam", "thomas", "john_mark",
  // 4. Tired and far away
  "elijah", "job", "naomi", "noah", "paul", "augustine", "robber_captain",
  // 5. The desert fathers and mothers
  "moses_the_ethiopian", "mary_of_egypt", "thais", "cyprian", "martha_of_egypt", "basils_young_man", "abba_moses_hermit",
  // 6. No one is too far
  "jacob_the_monk", "mary_niece_of_abraham", "martianus_woman", "hero_of_alexandria", "penitent_thief",
];

export const JOURNEY_KEY = "not-alone:journey:v1";

/** 1-based day of a person in the journey, or 0. */
export function journeyDay(id: string): number {
  return JOURNEY.indexOf(id) + 1;
}
