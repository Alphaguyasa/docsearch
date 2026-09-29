/**
 * The library: every book the site reads from, grouped by where it comes
 * from, in both languages. Each entry names the corpus source(s) behind it
 * (tests check every fetched source is listed once, and that "only for" says
 * the same as the source's traditions).
 */
import type { Tradition } from "@/lib/scripture/canon";

type Text = { en: string; am: string };

export interface LibraryBook {
  sourceIds: string[];
  title: Text;
  by: Text;
  note: Text;
  /** Shown only to readers of these traditions; absent = everyone. */
  onlyFor?: Tradition[];
}

export interface LibraryGroup {
  title: Text;
  books: LibraryBook[];
}

export const LIBRARY_PAGE = {
  en: {
    eyebrow: "The library",
    title: "The books behind every story",
    intro:
      "Every story on this site is read from one of these books, and every quote names its place so you can find it yourself. All of them are free to share: in the public domain, or used with permission.",
    shownTo: "Shown to readers who chose:",
    missing:
      "Many beloved books are not here yet — modern Amharic, Ge'ez, Coptic and Armenian church books are still under copyright. They can be added with the permission of the church or publisher.",
  },
  am: {
    eyebrow: "ቤተ መጻሕፍት",
    title: "ከእያንዳንዱ ታሪክ በስተጀርባ ያሉ መጻሕፍት",
    intro:
      "በዚህ ገጽ ያለ እያንዳንዱ ታሪክ ከእነዚህ መጻሕፍት በአንዱ ይነበባል፤ እያንዳንዱ ጥቅስም ቦታውን ይጠቅሳል፣ እርስዎም ራስዎ እንዲያገኙት። ሁሉም በነጻ ሊካፈሉ ይችላሉ፤ የሕዝብ ንብረት ናቸው ወይም በፈቃድ የቀረቡ ናቸው።",
    shownTo: "የሚታየው ለመረጡ አንባቢዎች፦",
    missing:
      "ብዙ የተወደዱ መጻሕፍት ገና እዚህ የሉም፤ የዘመኑ የአማርኛ፣ የግዕዝ፣ የቅብጥና የአርመን ቤተ ክርስቲያን መጻሕፍት በቅጂ መብት የተጠበቁ ናቸው። በቤተ ክርስቲያኗ ወይም በአሳታሚው ፈቃድ ሊጨመሩ ይችላሉ።",
  },
} as const;

const ETH: Tradition[] = ["ethiopian_orthodox"];

export const LIBRARY: LibraryGroup[] = [
  {
    title: { en: "Scripture", am: "መጽሐፍ ቅዱስ" },
    books: [
      {
        sourceIds: ["web"],
        title: { en: "World English Bible, with the Deuterocanon", am: "መጽሐፍ ቅዱስ (World English Bible)፣ ከመጻሕፍተ ሊቃውንት ጋር" },
        by: { en: "Public domain", am: "የሕዝብ ንብረት" },
        note: {
          en: "The whole Bible, including the books the Orthodox and Catholic Churches keep, such as Sirach and the Prayer of Manasseh.",
          am: "ኦርቶዶክስና ካቶሊክ አብያተ ክርስቲያናት የሚቀበሏቸውን እንደ ሲራክና የምናሴ ጸሎት ያሉትን መጻሕፍት ጨምሮ ሙሉው መጽሐፍ ቅዱስ።",
        },
      },
      {
        sourceIds: [],
        title: { en: "The 1962 Amharic Bible", am: "የ1962 (እ.ኤ.አ.) አማርኛ መጽሐፍ ቅዱስ" },
        by: {
          en: "© United Bible Societies 1962, the Bible Society of Ethiopia — non-commercial use",
          am: "© የተባበሩት መጽሐፍ ቅዱስ ማኅበራት 1962፣ የኢትዮጵያ መጽሐፍ ቅዱስ ማኅበር — ለንግድ ላልሆነ አገልግሎት",
        },
        note: {
          en: "Shown beside the English on the people pages, the prayers and the “Coming back” steps for Amharic readers.",
          am: "ለአማርኛ አንባቢዎች በሰዎቹ ገጾች፣ በጸሎቶቹና በ«መመለስ» ደረጃዎች ከእንግሊዝኛው ጎን ይታያል።",
        },
      },
    ],
  },
  {
    title: { en: "Books of the Ethiopian Church", am: "የኢትዮጵያ ቤተ ክርስቲያን መጻሕፍት" },
    books: [
      {
        sourceIds: ["synaxarium"],
        title: { en: "The Ethiopian Synaxarium", am: "ስንክሳር" },
        by: { en: "tr. E. A. Wallis Budge, 1928", am: "በE. A. Wallis Budge የተተረጎመ፣ 1928" },
        note: {
          en: "The saints of every day of the year, as read in the Ethiopian Church.",
          am: "በኢትዮጵያ ቤተ ክርስቲያን እንደሚነበበው የዓመቱ የእያንዳንዱ ቀን ቅዱሳን።",
        },
        onlyFor: ETH,
      },
      {
        sourceIds: ["enoch"],
        title: { en: "The Book of Enoch", am: "መጽሐፈ ሄኖክ" },
        by: { en: "tr. R. H. Charles, 1917", am: "በR. H. Charles የተተረጎመ፣ 1917" },
        note: { en: "In the Bible of the Ethiopian Orthodox Church.", am: "በኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ቤተ ክርስቲያን መጽሐፍ ቅዱስ ውስጥ ይገኛል።" },
        onlyFor: ETH,
      },
      {
        sourceIds: ["jubilees"],
        title: { en: "The Book of Jubilees", am: "መጽሐፈ ኩፋሌ" },
        by: { en: "tr. R. H. Charles, 1917", am: "በR. H. Charles የተተረጎመ፣ 1917" },
        note: { en: "In the Bible of the Ethiopian Orthodox Church.", am: "በኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ቤተ ክርስቲያን መጽሐፍ ቅዱስ ውስጥ ይገኛል።" },
        onlyFor: ETH,
      },
      {
        sourceIds: ["adam_and_eve"],
        title: { en: "The Book of Adam and Eve (the Conflict of Adam and Eve with Satan)", am: "ገድለ አዳም" },
        by: { en: "tr. S. C. Malan, 1882, from the Ethiopic", am: "በS. C. Malan ከግዕዝ የተተረጎመ፣ 1882" },
        note: {
          en: "Adam and Eve after the fall: their tears in the Cave of Treasures, their prayers, and God’s promise to save them.",
          am: "አዳምና ሔዋን ከውድቀት በኋላ፦ በመዝገብ ዋሻ ያፈሰሱት እንባ፣ ጸሎታቸውና እግዚአብሔር ሊያድናቸው የሰጠው ተስፋ።",
        },
        onlyFor: ETH,
      },
      {
        sourceIds: ["miracles_of_mary"],
        title: { en: "The Miracles of the Blessed Virgin Mary", am: "ተአምረ ማርያም" },
        by: { en: "tr. E. A. Wallis Budge, 1900, from the Ethiopic", am: "በE. A. Wallis Budge ከግዕዝ የተተረጎመ፣ 1900" },
        note: {
          en: "Read in the Ethiopian Church: the Virgin’s mercy to sinners — among them the cannibal of Kemer, saved by a cup of water given in her name.",
          am: "በኢትዮጵያ ቤተ ክርስቲያን የሚነበብ፤ የድንግል ማርያም ምሕረት ለኃጢአተኞች — ከእነርሱም በስሟ ጥቂት ውኃ በማጠጣቱ የዳነው በላዔ ሰብእ።",
        },
        onlyFor: ETH,
      },
      {
        sourceIds: ["takla_haymanot"],
        title: { en: "The Life of Takla Haymanot", am: "ገድለ ተክለ ሃይማኖት" },
        by: { en: "tr. E. A. Wallis Budge, 1906, from the Ethiopic", am: "በE. A. Wallis Budge ከግዕዝ የተተረጎመ፣ 1906" },
        note: {
          en: "The life of Ethiopia’s great saint, founder of Debre Libanos: his prayer, his fasting and the people he turned back to God.",
          am: "የደብረ ሊባኖስ መሥራች የታላቁ የኢትዮጵያ ቅዱስ ሕይወት፦ ጸሎቱ፣ ጾሙና ወደ እግዚአብሔር የመለሳቸው ሰዎች።",
        },
        onlyFor: ETH,
      },
      {
        sourceIds: ["kebra_nagast"],
        title: { en: "The Kebra Nagast, the Glory of Kings", am: "ክብረ ነገሥት" },
        by: { en: "tr. E. A. Wallis Budge, 1922", am: "በE. A. Wallis Budge የተተረጎመ፣ 1922" },
        note: {
          en: "Solomon, the Queen of Sheba and the Ark coming to Ethiopia — and God’s mercy on Solomon after his fall.",
          am: "ሰሎሞን፣ ንግሥተ ሳባና ታቦተ ጽዮን ወደ ኢትዮጵያ መምጣቷ — ሰሎሞንም ከወደቀ በኋላ እግዚአብሔር እንደማረው።",
        },
        onlyFor: ETH,
      },
    ],
  },
  {
    title: { en: "The Syriac Fathers", am: "የሶርያ አባቶች" },
    books: [
      {
        sourceIds: ["ephrem"],
        title: { en: "St. Ephrem the Syrian, Three Homilies", am: "ቅዱስ ኤፍሬም ሶርያዊ፣ ሦስት ድርሳናት" },
        by: { en: "tr. A. E. Johnston, 1898", am: "በA. E. Johnston የተተረጎመ፣ 1898" },
        note: {
          en: "Including “On Admonition and Repentance” and “On the Sinful Woman”.",
          am: "«ስለ ምክርና ንስሐ» እና «ስለ ኃጢአተኛዪቱ ሴት» የተሰኙትን ጨምሮ።",
        },
      },
      {
        sourceIds: ["aphrahat"],
        title: { en: "Aphrahat, the Demonstrations", am: "አፍራሃት፣ ድርሳናት" },
        by: { en: "tr. J. Gwynn, 1898", am: "በJ. Gwynn የተተረጎመ፣ 1898" },
        note: { en: "The Persian Sage, one of the oldest Syriac Fathers.", am: "«የፋርሱ ጠቢብ»፣ ከሶርያ አባቶች ቀደምት አንዱ።" },
      },
      {
        sourceIds: ["isaac"],
        title: { en: "St. Isaac the Syrian, Mystic Treatises", am: "ቅዱስ ይስሐቅ ሶርያዊ፣ ድርሳናት" },
        by: { en: "tr. A. J. Wensinck, 1923", am: "በA. J. Wensinck የተተረጎመ፣ 1923" },
        note: {
          en: "On sin, repentance and prayer; read by monks in Ethiopia, Egypt, Syria and beyond.",
          am: "ስለ ኃጢአት፣ ንስሐና ጸሎት፤ በኢትዮጵያ፣ በግብፅ፣ በሶርያና ከዚያም ባሻገር ባሉ መነኮሳት ይነበባል።",
        },
      },
    ],
  },
  {
    title: { en: "The Desert Fathers of Egypt", am: "የግብፅ የበረሃ አባቶች" },
    books: [
      {
        sourceIds: ["paradise"],
        title: { en: "The Paradise of the Holy Fathers", am: "የአባቶች ገነት" },
        by: { en: "tr. E. A. Wallis Budge, 1907", am: "በE. A. Wallis Budge የተተረጎመ፣ 1907" },
        note: { en: "Lives and sayings of the monks of the Egyptian desert.", am: "የግብፅ በረሃ መነኮሳት ሕይወትና ንግግሮች።" },
      },
      {
        sourceIds: ["lausiac"],
        title: { en: "Palladius, the Lausiac History", am: "ፓላዲዮስ፣ የላውሲያክ ታሪክ" },
        by: { en: "tr. W. K. Lowther Clarke, 1918", am: "በW. K. Lowther Clarke የተተረጎመ፣ 1918" },
        note: {
          en: "Including Moses the Ethiopian, the robber who became a saint.",
          am: "ሽፍታ የነበረውና ቅዱስ የሆነውን ሙሴ ጸሊምን ጨምሮ።",
        },
      },
      {
        sourceIds: ["antony"],
        title: { en: "St. Athanasius, the Life of Antony", am: "ቅዱስ አትናቴዎስ፣ የቅዱስ እንጦንስ ሕይወት" },
        by: { en: "tr. H. Ellershaw, 1892", am: "በH. Ellershaw የተተረጎመ፣ 1892" },
        note: { en: "The father of monks, and his long war with temptation.", am: "የመነኮሳት አባትና ከፈተና ጋር ያደረገው ረጅም ተጋድሎ።" },
      },
    ],
  },
  {
    title: { en: "Fathers of the early Church", am: "የጥንቷ ቤተ ክርስቲያን አባቶች" },
    books: [
      {
        sourceIds: ["confessions"],
        title: { en: "St. Augustine, Confessions", am: "ቅዱስ አውግስጢኖስ፣ ኑዛዜ" },
        by: { en: "tr. E. B. Pusey", am: "በE. B. Pusey የተተረጎመ" },
        note: { en: "His own story of sin, searching and coming home to God.", am: "የራሱ የኃጢአት፣ የፍለጋና ወደ እግዚአብሔር የመመለስ ታሪክ።" },
      },
      {
        sourceIds: ["cyril_repentance"],
        title: { en: "St. Cyril of Jerusalem, On Repentance", am: "ቅዱስ ቄርሎስ ዘኢየሩሳሌም፣ ስለ ንስሐ" },
        by: { en: "Catechetical Lecture II, NPNF", am: "የትምህርተ ሃይማኖት ትምህርት 2" },
        note: {
          en: "Sin is “a fearful evil, but not incurable”.",
          am: "ኃጢአት አስፈሪ ክፋት ነው፤ ግን የማይፈወስ አይደለም ይላል።",
        },
      },
      {
        sourceIds: ["chrysostom_theodore"],
        title: { en: "St. John Chrysostom, Letters to Theodore after his Fall", am: "ቅዱስ ዮሐንስ አፈወርቅ፣ ከወደቀ በኋላ ለቴዎድሮስ የጻፋቸው መልእክቶች" },
        by: { en: "NPNF", am: "NPNF" },
        note: {
          en: "Written to a friend who had left his vows, on God’s patience with those who fall.",
          am: "ስእለቱን ትቶ ለሄደ ወዳጁ የተጻፉ፤ እግዚአብሔር በሚወድቁት ላይ ስላለው ትዕግሥት።",
        },
      },
    ],
  },
];
