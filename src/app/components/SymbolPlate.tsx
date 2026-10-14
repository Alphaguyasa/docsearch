import { FigureSymbol } from "./FigureSymbol";

/**
 * Stands in for a painting when a person has none (no public-domain image of
 * them exists): their drawn symbol, large and gilt, on a candle-lit ground,
 * at the same size a painting would be so the cards stay even.
 */
export function SymbolPlate({ id, className = "" }: { id: string; className?: string }) {
  return (
    <div
      className={`relative grid place-items-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_55%,rgb(232_181_96_/_0.16),transparent_65%),linear-gradient(180deg,#1a140e,#0d0a07)] ${className}`}
    >
      <FigureSymbol
        id={id}
        className="draw-in h-[46%] w-auto text-[#e8b560] drop-shadow-[0_0_18px_rgb(232_181_96_/_0.35)] transition-transform duration-[2400ms] [transition-timing-function:var(--ease-out)] group-hover:scale-105"
      />
    </div>
  );
}
