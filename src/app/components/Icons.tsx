/**
 * The site's few interface icons, drawn to match the figure symbols: 24×24,
 * 1.6px round strokes in currentColor.
 */
type P = { className?: string };

function Icon({ className = "h-4 w-4", children }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

export const ChevronDown = (p: P) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const Check = (p: P) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const ArrowRight = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

/** A small Ethiopian-style hand cross, for the tradition picker. */
export const Cross = (p: P) => (
  <Icon {...p}>
    <path d="M12 3v18M7 8h10" />
    <circle cx="12" cy="3.5" r="1" />
    <circle cx="6.5" cy="8" r="1" />
    <circle cx="17.5" cy="8" r="1" />
    <path d="M9.5 17.5c1.5 1 3.5 1 5 0" />
  </Icon>
);

export const Quote = (p: P) => (
  <Icon {...p}>
    <path d="M9.5 7C6.5 8 5 10.5 5 14v3h4.5v-4.5H7c0-2 1-3.5 2.5-4.2M19 7c-3 1-4.5 3.5-4.5 7v3H19v-4.5h-2.5c0-2 1-3.5 2.5-4.2" />
  </Icon>
);
