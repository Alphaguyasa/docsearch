/**
 * The About page: what Not Alone is, where its words come from, how a story
 * is written (by an AI, from passages you can read), what is kept, and what
 * it is not. Plain statements the site already keeps to.
 */
export interface AboutSection {
  title: string;
  body: string[];
}

export const ABOUT: Record<"en" | "am", { eyebrow: string; title: string; intro: string; sections: AboutSection[] }> = {
  en: {
    eyebrow: "About",
    title: "About Not Alone",
    intro:
      "Not Alone is for anyone carrying a sin or a struggle alone. It shows you true stories of holy people who fell the same way and were restored — from Scripture and the Church Fathers, in English and Amharic.",
    sections: [
      {
        title: "Where the words come from",
        body: [
          "Scripture: the World English Bible (public domain), and for Amharic readers the 1962 Amharic Bible — Amharic Bible © United Bible Societies 1962, the Bible Society of Ethiopia; the New Testament e-text by the Lapsley/Brooks Foundation (1994) and Dirk Röckmann (2003), with kind permission of the Bible Society of Ethiopia. Used here for non-commercial purposes only.",
          "The Church Fathers: St. Augustine’s Confessions, the Lausiac History and the Paradise of the Holy Fathers (tr. E. A. Wallis Budge), and the Ethiopian Synaxarium, the Book of the Saints of the Ethiopian Church (tr. E. A. Wallis Budge). Also the Book of Enoch (tr. R. H. Charles), which the Ethiopian Orthodox Church keeps in its Bible; St. Ephrem the Syrian’s homily On Admonition and Repentance and Aphrahat’s Demonstrations, from the Syriac church; St. Cyril of Jerusalem’s lecture On Repentance; St. John Chrysostom’s letters to Theodore after his fall; St. Athanasius’s Life of Antony, the Egyptian father of monks; Thomas à Kempis’s The Imitation of Christ (Catholic, tr. William Benham) and John Bunyan’s Grace Abounding to the Chief of Sinners (Protestant).",
          "Every person’s page shows their story straight from these texts, with the reference, so you can find it in your own Bible or book.",
        ],
      },
      {
        title: "How a story is written",
        body: [
          "When you tell what you are carrying, the site finds the people and passages that match it. An AI language model then writes a short story from those passages only, and marks each line with the number of the passage it comes from.",
          "An AI can make mistakes. That is why the passages are always shown underneath: read them for yourself. The people pages, the prayers and the “Coming back to God” steps are not written by AI — they quote the texts word for word.",
        ],
      },
      {
        title: "What is kept",
        body: [
          "Nothing you write is saved. Your words are used to find a story and are then gone.",
          "The site keeps only simple counts — how many stories were read, and which struggles came up — never your words. If you tap “Did this help?”, only your answer is kept.",
          "In the Telegram bot, /daily and /journey keep your chat number, language and day so the morning message can reach you. /stop deletes them.",
        ],
      },
      {
        title: "What this is not",
        body: [
          "Not Alone is not a priest, a counsellor or an emergency service. It cannot hear your confession or give absolution. For that, go to your father of confession, or ask a priest at your parish church.",
          "If you are in danger, or thinking of harming yourself, reach someone now — the Help page has people to call.",
        ],
      },
    ],
  },
  am: {
    eyebrow: "ስለዚህ ገጽ",
    title: "ስለ «እርስዎ ብቻ አይደሉም»",
    intro:
      "ይህ ገጽ ኃጢአትን ወይም ትግልን ብቻውን ለሚሸከም ሰው ሁሉ ነው። በተመሳሳይ መንገድ ወድቀው የተመለሱ የቅዱሳን ሰዎችን እውነተኛ ታሪክ ከመጽሐፍ ቅዱስና ከቤተ ክርስቲያን አባቶች በአማርኛና በእንግሊዝኛ ያሳይዎታል።",
    sections: [
      {
        title: "ቃላቱ ከየት ይመጣሉ",
        body: [
          "መጽሐፍ ቅዱስ፦ World English Bible (የሕዝብ ንብረት የሆነ የእንግሊዝኛ ትርጉም)፤ ለአማርኛ አንባቢዎች ደግሞ የ1962ቱ የአማርኛ መጽሐፍ ቅዱስ — © United Bible Societies 1962፣ የኢትዮጵያ መጽሐፍ ቅዱስ ማኅበር፤ የአዲስ ኪዳኑ ኤሌክትሮኒክ ጽሑፍ በLapsley/Brooks Foundation (1994) እና በDirk Röckmann (2003)፣ በኢትዮጵያ መጽሐፍ ቅዱስ ማኅበር ፈቃድ። እዚህ ለንግድ ላልሆነ ዓላማ ብቻ ጥቅም ላይ ውሏል።",
          "የቤተ ክርስቲያን አባቶች፦ የቅዱስ አውግስጢኖስ «ኑዛዜ»፣ የላውሲያክ ታሪክና «የአባቶች ገነት» (በE. A. Wallis Budge የተተረጎሙ)፣ እንዲሁም የኢትዮጵያ ቤተ ክርስቲያን ስንክሳር (በE. A. Wallis Budge የተተረጎመ)። በተጨማሪም መጽሐፈ ሄኖክ (በR. H. Charles የተተረጎመ)፤ የቅዱስ ኤፍሬም ሶርያዊ «ስለ ምክርና ንስሐ» ድርሳንና የአፍራሃት (Aphrahat) ድርሳናት፤ የቅዱስ ቄርሎስ ዘኢየሩሳሌም «ስለ ንስሐ» ትምህርት፤ የቅዱስ ዮሐንስ አፈወርቅ ከወደቀ በኋላ ለቴዎድሮስ የጻፋቸው መልእክቶች፤ የቅዱስ አትናቴዎስ «የቅዱስ እንጦንስ ሕይወት»፤ የቶማስ አ ኬምፒስ «ክርስቶስን መምሰል» (ካቶሊክ) እና የጆን በንያን «ለኃጢአተኞች አለቃ የበዛ ጸጋ» (ፕሮቴስታንት)።",
          "የእያንዳንዱ ሰው ገጽ ታሪኩን በቀጥታ ከእነዚህ መጻሕፍት ከማጣቀሻው ጋር ያሳያል፤ በራስዎ መጽሐፍ ቅዱስ ወይም መጽሐፍ ሊያገኙት ይችላሉ።",
        ],
      },
      {
        title: "ታሪኩ እንዴት ይጻፋል",
        body: [
          "የተሸከሙትን ሲነግሩ፣ ገጹ የሚስማሙ ሰዎችንና ክፍሎችን ያገኛል። ከዚያም የሰው ሠራሽ አስተውሎት (AI) የቋንቋ ሞዴል ከእነዚያ ክፍሎች ብቻ አጭር ታሪክ ይጽፋል፤ እያንዳንዱን መስመር ከተወሰደበት ክፍል ቁጥር ጋር ምልክት ያደርጋል።",
          "AI ሊሳሳት ይችላል። ስለዚህ ክፍሎቹ ሁልጊዜ ከታች ይታያሉ፤ ራስዎ ያንብቧቸው። የሰዎቹ ገጾች፣ ጸሎቶቹና «ወደ እግዚአብሔር መመለስ» እርምጃዎች በAI የተጻፉ አይደሉም፤ መጻሕፍቱን ቃል በቃል ይጠቅሳሉ።",
        ],
      },
      {
        title: "ምን ይቀመጣል",
        body: [
          "የሚጽፉት ምንም ነገር አይቀመጥም። ቃላትዎ ታሪክ ለማግኘት ብቻ ያገለግላሉ፣ ከዚያም ይጠፋሉ።",
          "ገጹ የሚያስቀምጠው ቀላል ቁጥሮችን ብቻ ነው — ስንት ታሪኮች እንደተነበቡና የትኞቹ ትግሎች እንደተነሡ — ቃላትዎን በፍጹም አይደለም። «ረድቶዎታል?» የሚለውን ከነኩ፣ የሚቀመጠው መልስዎ ብቻ ነው።",
          "በቴሌግራም ቦቱ ውስጥ /daily እና /journey የማለዳው መልእክት እንዲደርስዎ የውይይት ቁጥርዎን፣ ቋንቋዎንና ቀኑን ያስቀምጣሉ። /stop ይሰርዛቸዋል።",
        ],
      },
      {
        title: "ይህ ገጽ ምን አይደለም",
        body: [
          "ይህ ገጽ ካህን፣ አማካሪ ወይም የድንገተኛ አደጋ አገልግሎት አይደለም። ኑዛዜዎን ሊሰማ ወይም ፍትሐት ሊሰጥ አይችልም። ለዚህ ወደ የንስሐ አባትዎ ይሂዱ፤ ከሌለዎት በአጥቢያ ቤተ ክርስቲያንዎ ካህን ይጠይቁ።",
          "አደጋ ላይ ከሆኑ ወይም ራስዎን ለመጉዳት እያሰቡ ከሆነ፣ አሁኑኑ ሰው ያግኙ — የእርዳታ ገጹ የሚደውሉላቸውን ሰዎች ይዟል።",
        ],
      },
    ],
  },
};
