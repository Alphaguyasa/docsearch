/** Tradition picker options — shared by the home page and the People page. */
import type { TraditionChoice } from "@/lib/scripture/tradition-choice";

export type { TraditionChoice };

/** Oriental Orthodox is the default view; the Ethiopian Church adds its own books. */
export const TRADITION_OPTIONS: { value: TraditionChoice; label: string }[] = [
  { value: "oriental_orthodox", label: "Oriental Orthodox" },
  { value: "ethiopian_orthodox", label: "Ethiopian Orthodox Tewahedo" },
];

export const TRADITION_KEY = "not-alone:tradition";
