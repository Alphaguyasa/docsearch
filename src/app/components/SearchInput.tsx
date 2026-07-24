"use client";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}

/** Centered search box. Submits on Enter (form submit); disabled while streaming. */
export function SearchInput({ value, onChange, onSubmit, disabled }: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex items-stretch border border-border focus-within:border-accent"
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={1000}
        autoFocus
        placeholder="Ask a question about the documents…"
        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 outline-none placeholder:text-muted disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        className="border-l border-border px-4 text-sm font-medium text-accent disabled:text-muted"
      >
        {disabled ? "…" : "Ask"}
      </button>
    </form>
  );
}
