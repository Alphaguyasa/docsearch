/**
 * Where to anchor the crop of tall paintings whose faces sit near the top, as
 * a vertical percentage (0 = top). Shared by the site (CSS object-position)
 * and scripts/og-images.ts (link-preview crops).
 */
export const FOCUS_PERCENT: Record<string, number> = {
  cyprian: 6,
  mary_of_egypt: 12,
};
