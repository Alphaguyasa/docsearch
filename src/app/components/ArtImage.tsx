import { artByline, artFor, artSrc, artSrcSet } from "@/app/art";

/**
 * A painting, sized for phones first: 800px WebP by default, 1600px on large
 * screens, lazy by default, with a 16px blur shown while it loads. Renders
 * nothing when the person has no painting, so callers can fall back.
 */
export function ArtImage({
  id,
  className = "",
  sizes = "(min-width: 1024px) 33vw, 100vw",
  eager = false,
  position = "center",
}: {
  id: string;
  className?: string;
  sizes?: string;
  eager?: boolean;
  position?: string;
}) {
  const a = artFor(id);
  if (!a) return null;
  return (
    <img
      src={artSrc(id, 800)}
      srcSet={artSrcSet(id)}
      sizes={sizes}
      alt={`${a.caption} — ${artByline(a)}`}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={`bg-cover object-cover ${className}`}
      style={{ backgroundImage: `url(${a.blur})`, objectPosition: position }}
    />
  );
}
