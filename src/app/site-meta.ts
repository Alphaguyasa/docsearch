// The home page is a client component, so its title and description are set by
// generateMetadata in layout.tsx and follow the reader's language, like every
// other page.
// The Amharic line is the bot's own Amharic description (api/telegram/setup).
export const SITE_META = {
  en: {
    title: "Not Alone — You are not the only one",
    description:
      "Tell what you are struggling with, and read the true stories of holy people who fell the same way and were restored — cited from Scripture and the Church Fathers.",
    locale: "en_US",
  },
  am: {
    title: "Not Alone — እርስዎ ብቻ አይደሉም",
    description:
      "እርስዎ ብቻ አይደሉም። የተሸከሙትን ይንገሩ፣ በተመሳሳይ መንገድ ወድቆ የተመለሰውን የቅዱስ ሰው እውነተኛ ታሪክ ከመጽሐፍ ቅዱስና ከቤተ ክርስቲያን አባቶች ያንብቡ።",
    locale: "am_ET",
  },
} as const;
