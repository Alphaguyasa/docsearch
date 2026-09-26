/**
 * One line-drawn symbol per person, all in the same hand: 64×64, 1.6px round
 * strokes in currentColor, no fills. Each is a few hundred bytes — they cost
 * nothing on a slow connection and stay sharp on any screen.
 *
 * The symbol is the moment of the story a reader would recognise: Peter's
 * rooster, Jacob's ladder, the basket of sand Abba Moses carried.
 */

const SYMBOLS: Record<string, React.ReactNode> = {
  // Harp: the psalmist who wrote Psalm 51.
  david: (
    <>
      <path d="M18 54 C14 34 18 16 30 10 C34 18 42 22 50 22 L46 54 Z" />
      <path d="M24 50 L27 15 M30 51 L31 13 M36 52 L36 19 M42 53 L42 21" />
    </>
  ),
  // Rooster: "before the rooster crows today, you will deny me three times."
  peter: (
    <>
      <path d="M22 50 C14 44 14 30 24 26 L26 18 L30 22 L32 16 L35 22 L38 20 L36 27 C42 28 44 34 42 40 C48 36 52 28 50 18 C56 24 56 38 48 46 C42 52 30 54 22 50 Z" />
      <path d="M24 26 L18 27 L22 30" />
      <circle cx="29" cy="28" r="0.8" />
      <path d="M28 51 L27 58 M34 51 L35 58 M24 58 L30 58 M32 58 L38 58" />
    </>
  ),
  // Light from heaven on the Damascus road.
  paul: (
    <>
      <path d="M32 6 L32 16 M20 10 L25 18 M44 10 L39 18 M12 20 L20 24 M52 20 L44 24" />
      <path d="M8 56 C20 48 44 48 56 56" />
      <path d="M28 56 L32 30 L36 56" />
    </>
  ),
  // The bush that burned and was not consumed.
  moses: (
    <>
      <path d="M32 54 L32 40 M32 44 L22 36 M32 42 L42 34 M24 54 L32 46 L40 54" />
      <path d="M32 8 C38 16 44 20 42 28 C41 32 37 34 32 34 C27 34 23 32 22 28 C20 20 28 16 32 8 Z" />
      <path d="M32 18 C35 22 36 26 34 29 C33 31 31 31 30 29 C28 26 30 22 32 18 Z" />
    </>
  ),
  // "Look now toward the sky, and count the stars."
  abraham: (
    <>
      <path d="M14 56 L28 34 L42 56 M28 34 L28 56" />
      <path d="M46 10 L47.5 14 L52 14.5 L48.5 17 L49.5 21.5 L46 19 L42.5 21.5 L43.5 17 L40 14.5 L44.5 14 Z" />
      <path d="M22 14 L22 18 M20 16 L24 16 M54 30 L54 34 M52 32 L56 32 M34 22 L34 25 M32.5 23.5 L35.5 23.5 M12 26 L12 29 M10.5 27.5 L13.5 27.5" />
    </>
  ),
  // The ladder at Bethel.
  jacob: (
    <>
      <path d="M22 58 L34 6 M38 58 L48 6" />
      <path d="M24.5 48 L40 48 M26.8 38 L41.9 38 M29.1 28 L43.8 28 M31.4 18 L45.7 18" />
      <path d="M12 58 L56 58" />
    </>
  ),
  // The great fish.
  jonah: (
    <>
      <path d="M8 34 C16 20 38 18 50 30 L58 22 L56 34 L58 46 L50 38 C38 50 16 48 8 34 Z" />
      <circle cx="18" cy="31" r="1" />
      <path d="M8 34 L16 36" />
      <path d="M22 54 C26 52 30 56 34 54 C38 52 42 56 46 54" />
    </>
  ),
  // The cave at Horeb and the still small voice.
  elijah: (
    <>
      <path d="M8 56 C8 30 18 14 32 14 C46 14 56 30 56 56" />
      <path d="M20 56 C20 40 25 32 32 32 C39 32 44 40 44 56" />
      <path d="M30 22 C33 20 36 24 39 22 M26 26 C29 24 32 28 35 26" />
    </>
  ),
  // The pillars of the house of Dagon.
  samson: (
    <>
      <path d="M14 58 L14 20 M24 58 L24 20 M40 58 L40 34 M50 58 L50 30" />
      <path d="M10 20 L28 20 M10 16 L28 16" />
      <path d="M36 34 L44 32 L42 28 L50 30 L54 26" />
      <path d="M8 58 L56 58" />
      <path d="M46 16 L50 20 M52 12 L54 18" />
    </>
  ),
  // The golden calf.
  aaron: (
    <>
      <path d="M18 18 C16 12 20 10 24 14 M46 18 C48 12 44 10 40 14" />
      <path d="M22 16 C26 14 38 14 42 16 C44 24 42 34 38 40 C35 44 29 44 26 40 C22 34 20 24 22 16 Z" />
      <path d="M22 22 L14 24 L22 26 M42 22 L50 24 L42 26" />
      <circle cx="28" cy="26" r="0.8" />
      <circle cx="36" cy="26" r="0.8" />
      <path d="M28 36 C30 38 34 38 36 36" />
      <path d="M16 54 L48 54 L44 48 L20 48 Z" />
    </>
  ),
  // The scarlet cord from her window in the wall.
  rahab: (
    <>
      <path d="M10 8 L10 58 M10 58 L54 58" />
      <path d="M10 16 L30 16 M10 26 L30 26 M10 36 L30 36 M10 46 L30 46 M20 16 L20 26 M16 26 L16 36 M22 36 L22 46 M18 46 L18 58" />
      <path d="M36 12 L50 12 L50 26 L36 26 Z" />
      <path d="M43 26 C41 32 45 36 43 42 C41 48 45 52 43 58" />
    </>
  ),
  // The tax booth's coins.
  matthew: (
    <>
      <ellipse cx="24" cy="44" rx="12" ry="4" />
      <path d="M12 44 L12 50 C12 52 18 54 24 54 C30 54 36 52 36 50 L36 44" />
      <path d="M12 38 L12 44 M36 38 L36 44" />
      <ellipse cx="24" cy="38" rx="12" ry="4" />
      <ellipse cx="44" cy="22" rx="10" ry="10" />
      <path d="M44 16 L44 28 M40 19 C40 17 48 17 48 19 C48 22 40 22 40 25 C40 27 48 27 48 25" />
    </>
  ),
  // The sycamore he climbed to see Jesus.
  zacchaeus: (
    <>
      <path d="M30 58 L30 38 C30 32 26 30 22 28 M34 58 L34 38 C34 32 38 30 42 28" />
      <path d="M32 36 L32 30" />
      <path d="M14 28 C6 24 10 12 20 14 C22 6 34 4 38 12 C46 8 56 16 50 24 C56 30 48 38 42 34 C38 38 26 38 22 34 C16 36 10 32 14 28 Z" />
      <path d="M24 58 L40 58" />
    </>
  ),
  // The water jar she left at the well.
  samaritan_woman: (
    <>
      <path d="M26 10 L38 10 M28 10 C28 14 26 16 22 20 C16 26 16 40 20 48 C22 52 26 54 32 54 C38 54 42 52 44 48 C48 40 48 26 42 20 C38 16 36 14 36 10" />
      <path d="M20 30 C28 33 36 33 44 30" />
      <path d="M44 22 C50 22 52 28 48 32" />
      <path d="M12 58 L52 58" />
    </>
  ),
  // Stones let fall, and writing in the dust.
  woman_caught_in_adultery: (
    <>
      <path d="M8 52 L56 52" />
      <path d="M14 44 C14 40 20 38 22 42 C24 46 18 48 14 44 Z M40 46 C40 42 46 41 47 44 C48 47 42 49 40 46 Z M28 48 C28 45 33 45 33 48" />
      <path d="M20 58 C24 56 26 60 30 58 C34 56 36 60 40 58" />
      <path d="M32 10 L32 30 M32 30 L30 36" />
      <path d="M28 14 C28 10 36 10 36 14 L36 28 C36 30 34 32 32 32" />
    </>
  ),
  // The open hand he was invited to reach out.
  thomas: (
    <>
      <path d="M22 58 L22 36 L18 26 C17 23 21 21 23 24 L26 30 L26 12 C26 9 30 9 30 12 L30 28 L31 8 C31 5 35 5 35 8 L35 28 L37 10 C37 7 41 7 41 10 L40 30 L43 16 C44 13 48 14 47 17 L44 38 C43 46 40 50 40 58" />
      <circle cx="34" cy="42" r="2.2" />
    </>
  ),
  // A road that turns back, and returns.
  john_mark: (
    <>
      <path d="M16 58 C16 44 44 44 44 32 C44 20 20 22 20 12" />
      <path d="M16 12 L20 6 L24 12" />
      <path d="M46 52 L50 52 M48 48 L48 56" />
      <path d="M10 58 L22 58" />
    </>
  ),
  // The crown he lost and was given back.
  nebuchadnezzar: (
    <>
      <path d="M14 42 L10 18 L22 30 L32 12 L42 30 L54 18 L50 42 Z" />
      <path d="M14 48 L50 48" />
      <circle cx="10" cy="16" r="1.5" />
      <circle cx="32" cy="10" r="1.5" />
      <circle cx="54" cy="16" r="1.5" />
      <path d="M18 58 C20 54 22 54 22 58 M28 58 C30 53 32 53 32 58 M38 58 C40 54 42 54 42 58" />
    </>
  ),
  // The chains he was carried off in, broken.
  manasseh: (
    <>
      <ellipse cx="14" cy="20" rx="5" ry="8" transform="rotate(-40 14 20)" />
      <ellipse cx="24" cy="28" rx="5" ry="8" transform="rotate(50 24 28)" />
      <path d="M31 33 C34 34 36 36 36 38" />
      <path d="M38 42 C38 40 40 38 43 37" />
      <ellipse cx="46" cy="44" rx="5" ry="8" transform="rotate(-40 46 44)" />
      <path d="M30 42 L26 46 M34 46 L34 52 M40 32 L44 28" />
    </>
  ),
  // The pears he stole "only for the pleasure of the theft".
  augustine: (
    <>
      <path d="M32 16 C28 16 27 22 26 26 C22 30 16 36 18 46 C20 54 28 56 32 56 C36 56 44 54 46 46 C48 36 42 30 38 26 C37 22 36 16 32 16 Z" />
      <path d="M32 16 C32 12 33 9 35 7" />
      <path d="M34 11 C38 7 44 8 46 10 C42 14 38 14 34 11 Z" />
    </>
  ),
  // The leaking basket of sand he carried rather than judge a brother.
  moses_the_ethiopian: (
    <>
      <path d="M14 18 L50 18 L44 44 L20 44 Z" />
      <path d="M17 26 L47 26 M19 34 L45 34 M24 18 L26 44 M32 18 L32 44 M40 18 L38 44" />
      <path d="M20 18 C20 8 44 8 44 18" />
      <path d="M30 48 L30 49 M34 51 L34 52 M29 54 L29 55 M33 57 L33 58" />
    </>
  ),
  // The desert and the rising sun.
  mary_of_egypt: (
    <>
      <circle cx="32" cy="30" r="8" />
      <path d="M32 14 L32 18 M18 22 L21 24 M46 22 L43 24" />
      <path d="M6 48 C16 38 24 44 32 40 C40 36 48 42 58 38" />
      <path d="M6 56 C18 50 30 54 40 50 C46 48 52 50 58 48" />
    </>
  ),
};

/** A candle: used for the site mark and anyone without a symbol of their own. */
const CANDLE = (
  <>
    <path d="M32 6 C36 12 38 16 36 21 C35 24 29 24 28 21 C26 16 28 12 32 6 Z" />
    <path d="M32 24 L32 28" />
    <path d="M24 28 L40 28 L40 56 L24 56 Z" />
    <path d="M18 58 L46 58" />
  </>
);

export function FigureSymbol({
  id,
  className,
  title,
}: {
  id: string;
  className?: string;
  /** Accessible name; omit when the name is printed next to the symbol. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {SYMBOLS[id] ?? CANDLE}
    </svg>
  );
}

export function CandleMark({ className }: { className?: string }) {
  return <FigureSymbol id="__candle" className={className} />;
}
