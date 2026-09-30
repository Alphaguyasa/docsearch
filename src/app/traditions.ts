/** Tradition picker options — shared by the home page and the People page. */
export type TraditionChoice = "all" | "protestant" | "catholic" | "orthodox" | "ethiopian_orthodox";

/** The site serves the Oriental Orthodox churches: all of them, or the Ethiopian Church with its own books. */
export const TRADITION_OPTIONS: { value: TraditionChoice; label: string }[] = [
  { value: "all", label: "Oriental Orthodox" },
  { value: "ethiopian_orthodox", label: "Ethiopian Orthodox Tewahedo" },
];

export const TRADITION_KEY = "not-alone:tradition";
