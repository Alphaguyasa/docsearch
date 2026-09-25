import { FIGURES } from "@/lib/scripture/figures";

export const metadata = { title: "People — Not Alone" };

const TRADITION_NAMES: Record<string, string> = {
  protestant: "Protestant",
  catholic: "Catholic",
  orthodox: "Eastern Orthodox",
  ethiopian_orthodox: "Ethiopian Orthodox",
};

function tagLabel(tag: string): string {
  return tag.replace(/_/g, " ");
}

/** Every person in the library, their fall in one line, and where to read it. Static — no DB. */
export default function PeoplePage() {
  const people = FIGURES.filter((f) => f.passages.some((p) => p.sourceId !== "pending"));
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:pt-16">
      <h1 className="font-serif text-[1.9rem] leading-tight sm:text-4xl">People who fell and were restored</h1>
      <p className="mt-2 max-w-prose text-muted">
        {people.length} people from Scripture and the Church Fathers. Each story is read from the text itself.
      </p>
      <ul className="mt-8 divide-y divide-border border-y border-border">
        {people.map((f) => {
          const everywhere = f.traditions.length === 4;
          return (
            <li key={f.id} className="py-5">
              <h2 className="font-serif text-xl">{f.name}</h2>
              <p className="mt-1 max-w-prose leading-7">{f.summary}</p>
              <p className="mt-2 text-sm text-muted">
                {f.sins.map(tagLabel).join(", ")}
                {f.kind === "tradition" && " — from Church tradition"}
                {!everywhere && ` — honoured in ${f.traditions.map((t) => TRADITION_NAMES[t]).join(", ")}`}
              </p>
              <p className="mt-1 text-sm text-muted">
                Read: {f.passages.filter((p) => p.sourceId !== "pending").map((p) => p.ref).join("; ")}
              </p>
              {f.note && <p className="mt-1 text-sm italic text-muted">{f.note}</p>}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
