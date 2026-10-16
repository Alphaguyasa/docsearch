/** Tradition picker options — shared by the home page and the People page. */
import type { TraditionChoice } from "@/lib/scripture/tradition-choice";

export type { TraditionChoice };

/**
 * Oriental Orthodox is the default view; the Ethiopian Church adds its own books.
 * The other traditions are opt-in, after them (owner, 2026-10-14).
 */
export const TRADITION_OPTIONS: { value: TraditionChoice; label: string }[] = [
  { value: "oriental_orthodox", label: "Oriental Orthodox" },
  { value: "ethiopian_orthodox", label: "Ethiopian Orthodox Tewahedo" },
  { value: "orthodox", label: "Eastern Orthodox" },
  { value: "catholic", label: "Catholic" },
  { value: "protestant", label: "Protestant" },
];

export const TRADITION_KEY = "not-alone:tradition";
