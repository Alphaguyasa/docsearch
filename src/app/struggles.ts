/**
 * Pages for each struggle ("Bible stories for someone struggling with lying"),
 * in the words people actually search with, in English and Amharic. Each
 * gathers the people whose seed tags fall in that group (people.ts GROUPS).
 */
import type { Figure } from "@/lib/scripture/figures";

import type { Lang } from "./i18n/dict";
import { GROUPS, readablePeople } from "./people";

interface StruggleText {
  /** The page heading — also its title in search results. */
  h1: string;
  /** One line a person might actually write, in their own words. */
  example: string;
}

export const STRUGGLES: Record<string, Record<Lang, StruggleText>> = {
  lust: {
    en: { h1: "Bible stories for anyone struggling with lust", example: "I can't stop looking at things I shouldn't." },
    am: { h1: "ከፍትወት ጋር ለሚታገል ሰው የመጽሐፍ ቅዱስ ታሪኮች", example: "ማየት የሌለብኝን ነገር ማየት ማቆም አልቻልኩም።" },
  },
  anger: {
    en: { h1: "Bible stories for anyone struggling with anger", example: "My anger hurts the people I love." },
    am: { h1: "ከቁጣ ጋር ለሚታገል ሰው የመጽሐፍ ቅዱስ ታሪኮች", example: "ቁጣዬ የምወዳቸውን ሰዎች ይጎዳል።" },
  },
  lying: {
    en: {
      h1: "Bible stories for anyone struggling with lying and gossip",
      example: "I keep lying, even when I don't need to.",
    },
    am: { h1: "ከውሸትና ከሐሜት ጋር ለሚታገል ሰው የመጽሐፍ ቅዱስ ታሪኮች", example: "ባያስፈልገኝም እንኳ ሁልጊዜ እዋሻለሁ።" },
  },
  pride: {
    en: { h1: "Bible stories for anyone struggling with pride", example: "I think I am better than other people." },
    am: { h1: "ከትዕቢት ጋር ለሚታገል ሰው የመጽሐፍ ቅዱስ ታሪኮች", example: "ከሌሎች ሰዎች የተሻልኩ እንደሆንኩ አስባለሁ።" },
  },
  greed: {
    en: {
      h1: "Bible stories for anyone struggling with greed and stealing",
      example: "I took money that was not mine.",
    },
    am: { h1: "ከስግብግብነትና ከስርቆት ጋር ለሚታገል ሰው የመጽሐፍ ቅዱስ ታሪኮች", example: "የእኔ ያልሆነ ገንዘብ ወሰድኩ።" },
  },
  fear: {
    en: {
      h1: "Bible stories for anyone struggling with fear and shame",
      example: "I am too ashamed to tell anyone what I did.",
    },
    am: { h1: "ከፍርሃትና ከኀፍረት ጋር ለሚታገል ሰው የመጽሐፍ ቅዱስ ታሪኮች", example: "ያደረግሁትን ለማንም ለመናገር እጅግ አፍራለሁ።" },
  },
  away: {
    en: { h1: "Bible stories for anyone who has turned away from God", example: "I have been far from God for years." },
    am: { h1: "ከእግዚአብሔር ለራቀ ሰው የመጽሐፍ ቅዱስ ታሪኮች", example: "ለዓመታት ከእግዚአብሔር ርቄያለሁ።" },
  },
  despair: {
    en: {
      h1: "Bible stories for anyone struggling with despair and doubt",
      example: "I feel too far gone for God to forgive me.",
    },
    am: { h1: "ከተስፋ መቁረጥና ከጥርጣሬ ጋር ለሚታገል ሰው የመጽሐፍ ቅዱስ ታሪኮች", example: "እግዚአብሔር ይቅር ሊለኝ የማይችል ያህል እጅግ ርቄያለሁ።" },
  },
  addiction: {
    en: {
      h1: "Bible stories for anyone struggling with addiction",
      example: "I can't stop drinking, and it is destroying my family.",
    },
    am: { h1: "ከሱስ ጋር ለሚታገል ሰው የመጽሐፍ ቅዱስ ታሪኮች", example: "መጠጥ ማቆም አልቻልኩም፤ ቤተሰቤንም እያፈረሰ ነው።" },
  },
};

export const STRUGGLE_IDS = GROUPS.map((g) => g.id).filter((id) => id in STRUGGLES);

/** The people for a struggle: most matching tags first, Scripture before tradition, then seed order. */
export function peopleForStruggle(id: string, all: Figure[]): Figure[] {
  const group = GROUPS.find((g) => g.id === id);
  if (!group) return [];
  return readablePeople(all)
    .map((f, order) => ({ f, order, n: f.sins.filter((s) => group.tags.includes(s)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || (a.f.kind === b.f.kind ? 0 : a.f.kind === "scripture" ? -1 : 1) || a.order - b.order)
    .map((x) => x.f);
}
