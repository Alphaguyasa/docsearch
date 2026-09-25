/** Tradition picker options — shared by the home page and the People page. */
export type TraditionChoice = "all" | "protestant" | "catholic" | "orthodox" | "ethiopian_orthodox";

export const TRADITION_OPTIONS: { value: TraditionChoice; label: string }[] = [
  { value: "all", label: "Any tradition" },
  { value: "ethiopian_orthodox", label: "Ethiopian Orthodox" },
  { value: "orthodox", label: "Eastern Orthodox" },
  { value: "catholic", label: "Catholic" },
  { value: "protestant", label: "Protestant" },
];

export const TRADITION_KEY = "not-alone:tradition";
