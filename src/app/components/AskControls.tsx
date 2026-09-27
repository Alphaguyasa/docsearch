"use client";

/**
 * The two choices that change what an answer is: what KIND of question this is,
 * and whose books to draw on.
 *
 * These are surfaced as controls rather than inferred from the wording of the
 * question. Guessing would be wrong often enough to matter — "what happens when
 * we die" is a direct question, a comparison across traditions, or a person
 * asking because someone just died, and only they know which. Getting that wrong
 * for the third case is the worst failure this site can have.
 */

export type Mode = "answer" | "compare" | "counsel";
export type TraditionFilter = "all" | "eastern" | "oriental";

const MODES: { value: Mode; label: string; hint: string }[] = [
  {
    value: "answer",
    label: "Ask",
    hint: "A direct answer from across the whole library, with citations.",
  },
  {
    value: "compare",
    label: "Compare sources",
    hint: "What each book says on its own terms, and where they differ.",
  },
  {
    value: "counsel",
    label: "For my situation",
    hint: "What the Fathers, the sayings and the scriptures say to a situation in your life.",
  },
];

const TRADITIONS: { value: TraditionFilter; label: string }[] = [
  { value: "all", label: "All Orthodox" },
  { value: "eastern", label: "Eastern Orthodox" },
  { value: "oriental", label: "Oriental Orthodox" },
];

interface Props {
  mode: Mode;
  tradition: TraditionFilter;
  onModeChange: (mode: Mode) => void;
  onTraditionChange: (tradition: TraditionFilter) => void;
  disabled: boolean;
}

export function AskControls({
  mode,
  tradition,
  onModeChange,
  onTraditionChange,
  disabled,
}: Props) {
  const active = MODES.find((m) => m.value === mode);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Question type" className="flex flex-wrap gap-px">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => onModeChange(m.value)}
              disabled={disabled}
              aria-pressed={mode === m.value}
              className={`border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                mode === m.value
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <label className="sr-only" htmlFor="tradition">
            Tradition
          </label>
          <select
            id="tradition"
            value={tradition}
            onChange={(e) => onTraditionChange(e.target.value as TraditionFilter)}
            disabled={disabled}
            className="border border-border bg-transparent px-2 py-1.5 text-sm disabled:opacity-50"
          >
            {TRADITIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {active && <p className="text-xs leading-5 text-muted">{active.hint}</p>}

      {tradition !== "all" && (
        // Said plainly, because a reader who picks one side could otherwise
        // reasonably think the Fathers had been filtered out. They have not,
        // and they should not be: everything before Chalcedon belongs to both.
        <p className="text-xs leading-5 text-muted">
          Answers will draw on{" "}
          {tradition === "eastern" ? "Eastern Orthodox" : "Oriental Orthodox"} sources
          together with the Fathers, scriptures and councils that both communions
          share.
        </p>
      )}
    </div>
  );
}
