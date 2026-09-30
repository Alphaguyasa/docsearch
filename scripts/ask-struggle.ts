/**
 * Try struggle retrieval from the command line (no answer generation).
 *
 *   npm run scripture:ask -- "I keep lying to my parents" [--tradition protestant]
 */
import { retrieveForStruggle } from "../src/lib/scripture/retrieve-struggle";
import type { Tradition } from "../src/lib/scripture/canon";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const t = args.indexOf("--tradition");
  const tradition = t >= 0 ? (args.splice(t, 2)[1] as Tradition) : undefined;
  const message = args.join(" ");
  if (!message) throw new Error('usage: npm run scripture:ask -- "message" [--tradition X]');
  const r = await retrieveForStruggle(message, { filterTraditions: tradition ? [tradition] : undefined });
  console.log(`tags: ${r.tags.join(", ") || "(none)"} via ${r.via}`);
  console.log(`figures: ${r.figures.map((f) => f.name).join(", ") || "(none)"}`);
  for (const c of r.results) console.log(`  ${c.fusedScore.toFixed(3)}  ${c.ref ?? c.title}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
