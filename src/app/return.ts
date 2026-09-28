/**
 * "Coming back to God": a few plain steps for someone who wants to return,
 * each resting on a passage quoted word for word from the corpus — the World
 * English Bible, and once the Ethiopian Synaxarium (`chunkId`; every quote
 * checked by SQL when added).
 * The words around the verses are ours and say only what the verse says,
 * except the one pastoral pointer to a father of confession.
 */
export interface ReturnStep {
  chunkId: string;
  ref: string;
  /** Where to find it in an Amharic (Ethiopian) Bible; Psalms are numbered one lower there. */
  refAm: string;
  quote: string;
  en: { title: string; body: string };
  am: { title: string; body: string };
}

export const RETURN_PAGE = {
  en: {
    eyebrow: "Coming back",
    title: "How do I come back to God?",
    intro:
      "Every person on this site fell, and every one came back. There is no special language and no amount of time you must wait. These are the steps Scripture itself shows — one at a time.",
    readIn: "Read it in your Bible",
    stories: "Read the stories of people who came back",
  },
  am: {
    eyebrow: "መመለስ",
    title: "ወደ እግዚአብሔር እንዴት እመለሳለሁ?",
    intro:
      "በዚህ ገጽ ላይ ያለ እያንዳንዱ ሰው ወድቋል፣ እያንዳንዱም ተመልሷል። ልዩ ቋንቋ ወይም የሚጠበቅ ጊዜ የለም። እነዚህ መጽሐፍ ቅዱስ ራሱ የሚያሳያቸው እርምጃዎች ናቸው — አንድ በአንድ።",
    readIn: "በመጽሐፍ ቅዱስዎ ያንብቡት",
    stories: "የተመለሱ ሰዎችን ታሪክ ያንብቡ",
  },
} as const;

export const RETURN_STEPS: ReturnStep[] = [
  {
    chunkId: "777cb9cb-5263-44b4-b786-2e99211f5f0e",
    ref: "Malachi 3:7",
    refAm: "ሚልክያስ 3፥7",
    quote: "Return to me, and I will return to you",
    en: {
      title: "He is the one calling you back",
      body: "Coming back does not start with you being good enough. God asks you to return, and promises to meet you.",
    },
    am: {
      title: "የሚጠራዎ እርሱ ነው",
      body: "መመለስ የሚጀምረው እርስዎ በቂ ጥሩ ስለሆኑ አይደለም። እግዚአብሔር እንዲመለሱ ይጠራዎታል፣ ሊገናኝዎም ተስፋ ይሰጣል።",
    },
  },
  {
    chunkId: "8959b2c7-9fb7-418f-bce8-825d0522f4de",
    ref: "Psalm 32:5",
    refAm: "መዝሙረ ዳዊት 31 (32)፥5",
    quote:
      "I acknowledged my sin to you. I didn’t hide my iniquity. I said, I will confess my transgressions to Yahweh, and you forgave the iniquity of my sin.",
    en: {
      title: "Tell God the truth",
      body: "Say plainly what you did, without hiding or excusing it. David did, and was forgiven.",
    },
    am: {
      title: "ለእግዚአብሔር እውነቱን ይንገሩ",
      body: "ያደረጉትን ሳይደብቁና ሰበብ ሳያቀርቡ በግልጽ ይናገሩ። ዳዊት እንዲህ አደረገ፣ ይቅርም ተባለ።",
    },
  },
  {
    chunkId: "c967a2c3-2400-4d64-b5e5-769445660e40",
    ref: "Luke 15:18, 20",
    refAm: "ሉቃስ 15፥18፣ 20",
    quote:
      "I will get up and go to my father … But while he was still far off, his father saw him and was moved with compassion, and ran, fell on his neck, and kissed him.",
    en: {
      title: "Get up and go",
      body: "The son did not wait until he felt worthy. He started walking — and his father ran to him.",
    },
    am: {
      title: "ተነሥተው ይሂዱ",
      body: "ልጁ የሚገባው መስሎ እስኪሰማው አልጠበቀም። መሄድ ጀመረ — አባቱም ወደ እርሱ ሮጠ።",
    },
  },
  {
    chunkId: "28eddd01-eaec-4c26-a48c-e1e2447916f6",
    ref: "James 5:16",
    refAm: "ያዕቆብ 5፥16",
    quote: "Confess your sins to one another and pray for one another, that you may be healed.",
    en: {
      title: "Confess it to a person",
      body: "Healing comes when it is said out loud to someone who will pray for you. In the Orthodox Church this is your father of confession. If you don’t have one, go to your parish church and ask a priest.",
    },
    am: {
      title: "ለሰው ይናዘዙ",
      body: "ፈውስ የሚመጣው ለሚጸልይልዎ ሰው ጮክ ብለው ሲናገሩት ነው። በኦርቶዶክስ ቤተ ክርስቲያን ይህ የንስሐ አባትዎ ነው። ከሌለዎት፣ ወደ አጥቢያ ቤተ ክርስቲያንዎ ሄደው ካህን ይጠይቁ።",
    },
  },
  {
    chunkId: "9f96d4ac-e786-4742-a582-ea04aad8b482",
    ref: "1 John 1:9",
    refAm: "1ኛ ዮሐንስ 1፥9",
    quote:
      "If we confess our sins, he is faithful and righteous to forgive us the sins and to cleanse us from all unrighteousness.",
    en: {
      title: "Believe you are forgiven",
      body: "Forgiveness does not depend on how you feel afterwards. It rests on God being faithful. Shame does not get the last word.",
    },
    am: {
      title: "ይቅር እንደተባሉ ይመኑ",
      body: "ይቅርታ ከዚያ በኋላ በሚሰማዎ ስሜት ላይ የተመሠረተ አይደለም። በእግዚአብሔር ታማኝነት ላይ ነው። ኀፍረት የመጨረሻውን ቃል አይናገርም።",
    },
  },
  {
    chunkId: "a3cfb41b-9a7e-40ce-b8e4-e345e0ed4e7f",
    ref: "Ethiopian Synaxarium, Takhsas — the council against Novatus",
    refAm: "ስንክሳር፣ ታኅሣሥ — ኖቫጦስን የተቃወመው ጉባኤ",
    quote:
      "Our Lord Jesus Christ hath placed repentance so that it may be found by everyone who hath denied the Faith, or who hath fallen into sin.",
    en: {
      title: "No fall is too far",
      body: "When a priest taught that those who had denied Christ could never be taken back, the bishops answered with David and Peter: repentance is open to everyone.",
    },
    am: {
      title: "የማይመለስ ውድቀት የለም",
      body: "አንድ ካህን ክርስቶስን የካዱ ፈጽሞ ሊመለሱ አይችሉም ብሎ ባስተማረ ጊዜ፣ ጳጳሳቱ በዳዊትና በጴጥሮስ መለሱለት፤ ንስሐ ለሁሉ የተከፈተ ነው።",
    },
  },
  {
    chunkId: "2b0eedae-3a07-4536-ab19-570ae2e411a5",
    ref: "Isaiah 1:18",
    refAm: "ኢሳይያስ 1፥18",
    quote: "Though your sins are as scarlet, they shall be as white as snow.",
    en: {
      title: "Start again, clean",
      body: "What you did is not who you are anymore. If you fall again, come back again.",
    },
    am: {
      title: "በንጽሕና እንደገና ይጀምሩ",
      body: "ያደረጉት ከእንግዲህ ማንነትዎ አይደለም። እንደገና ቢወድቁ፣ እንደገና ይመለሱ።",
    },
  },
];
