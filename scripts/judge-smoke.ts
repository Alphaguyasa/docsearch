/**
 * Judge prompt regression check — no run or golden set required.
 *
 *   npm run eval:judge-smoke
 *
 * Exercises all four judges against a fixed adversarial battery and asserts
 * each returns valid JSON. The cases are chosen so a correct judge cannot pass
 * by accident: a fabricated figure that must be marked contradicted, a
 * differently-worded but equivalent answer that must be marked correct, a
 * citation pointing at a topically-related passage that does NOT support the
 * sentence, and a dangling marker.
 *
 * This is a smoke test of the PROMPTS, not calibration. Kappa still requires
 * scripts/calibrate-judge.ts against a completed run.
 */
import "../src/lib/loadenv";

import {
  getJudgeProvider,
  judgeCitationAccuracy,
  judgeCorrectness,
  judgeFaithfulness,
  judgeRefusal,
} from "../eval/src/metrics/judge";
import type { RetrievedChunk } from "../eval/src/types";

const retrieved: RetrievedChunk[] = [
  {
    chunkId: "chunk-a",
    docId: "doc-1",
    page: 3,
    text: "Full-time employees receive 25 days of paid annual leave per year. Unused leave may be carried over, capped at five days.",
    score: 0.9,
    rank: 1,
  },
  {
    chunkId: "chunk-b",
    docId: "doc-1",
    page: 7,
    text: "The office is closed on public holidays, which do not count against annual leave.",
    score: 0.7,
    rank: 2,
  },
];

async function main(): Promise<void> {
  const provider = getJudgeProvider();
  console.log(`Judge provider: ${provider.name} (${provider.model})\n`);

  // Deliberately mixed: claim 1 supported, claim 2 (30 days) contradicted.
  const answer =
    "Full-time staff get 25 days of paid leave [1]. Employees may also bank up to 30 unused days [1].";

  const faith = await judgeFaithfulness(provider, answer, retrieved);
  console.log("1. FAITHFULNESS:", faith.ok ? "valid JSON" : `ERROR ${faith.error}`);
  if (faith.ok) {
    // Null when the answer made no claims at all — a refusal is not scored.
    const score = faith.value.score;
    console.log(
      `   score ${score === null ? "n/a (no claims)" : score.toFixed(2)} ` +
        `over ${faith.value.claims.length} claim(s)`,
    );
    for (const c of faith.value.claims) console.log(`   - [${c.label}] ${c.claim}`);
  }

  const corr = await judgeCorrectness(
    provider,
    "How much annual leave do full-time employees get?",
    "Full-time staff receive twenty-five days off each year.",
    "25 days of paid annual leave",
  );
  console.log(
    "\n2. CORRECTNESS:",
    corr.ok ? `valid JSON — ${corr.value.verdict} (${corr.value.score})` : `ERROR ${corr.error}`,
  );

  // [2] is the public-holidays passage — wrong support for a leave-count claim.
  const cite = await judgeCitationAccuracy(
    provider,
    "Full-time employees receive 25 days of leave [2].",
    retrieved,
  );
  console.log("\n3. CITATION ACCURACY:", cite.ok ? "valid JSON" : `ERROR ${cite.error}`);
  if (cite.ok) {
    console.log(`   score ${cite.value.score.toFixed(2)}`);
    for (const c of cite.value.citations) {
      console.log(`   - ${c.chunkId} valid=${c.valid} — ${c.reason.slice(0, 80)}`);
    }
  }

  const danglingCite = await judgeCitationAccuracy(
    provider,
    "This is stated plainly [9].",
    retrieved,
  );
  console.log(
    "\n3b. DANGLING CITATION (no LLM needed):",
    danglingCite.ok
      ? `score ${danglingCite.value.score} — ${danglingCite.value.citations[0]?.reason}`
      : `ERROR ${danglingCite.error}`,
  );

  const refusedOk = await judgeRefusal(
    provider,
    "What is the CEO's home address?",
    "This question is not covered by these documents.",
  );
  const refusedBad = await judgeRefusal(
    provider,
    "What is the CEO's home address?",
    "The CEO lives at 14 Coriston Road.",
  );
  console.log(
    "\n4. REFUSAL:",
    refusedOk.ok && refusedBad.ok
      ? `valid JSON — declined=${refusedOk.value.score}, hallucinated=${refusedBad.value.score}`
      : "ERROR",
  );

  const allOk = [faith, corr, cite, danglingCite, refusedOk, refusedBad].every((r) => r.ok);
  console.log(`\n${allOk ? "✓" : "✗"} ${allOk ? "All judges returned valid JSON." : "A judge failed."}`);
  if (!allOk) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
