import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import { FIGURES } from "../src/lib/scripture/figures";
import type { SearchStreamMessage } from "../src/lib/search-stream";
import {
  MAX_MESSAGE,
  channelCaption,
  collectStream,
  crisisMessage,
  detectLang,
  fallbackMessage,
  htmlToPlain,
  markdownToHtml,
  sendHtml,
  setupKey,
  splitMessage,
  storyMessages,
  todayCaption,
  webhookSecret,
} from "../src/lib/telegram";

afterEach(() => mock.restoreAll());

async function* from(msgs: SearchStreamMessage[]) {
  yield* msgs;
}

test("language follows the script first, then the phone setting", () => {
  assert.equal(detectLang("ለወላጆቼ መዋሸት ማቆም አልቻልኩም።"), "am");
  assert.equal(detectLang("I keep lying", "am"), "en");
  assert.equal(detectLang("/start", "am"), "am");
  assert.equal(detectLang("/start", "en-US"), "en");
});

test("webhook secret is stable, token-bound and in Telegram's allowed alphabet", () => {
  const a = webhookSecret("123:abc");
  assert.equal(a, webhookSecret("123:abc"));
  assert.notEqual(a, webhookSecret("123:abd"));
  assert.match(a, /^[A-Za-z0-9_-]{1,256}$/);
});

test("answer markdown becomes safe Telegram HTML", () => {
  assert.equal(
    markdownToHtml("**Peter** wept <bitterly> & *alone*"),
    "<b>Peter</b> wept &lt;bitterly&gt; &amp; <i>alone</i>",
  );
});

test("a story lists only the passages its answer cites, and links to the site", async () => {
  const result = await collectStream(
    from([
      {
        type: "sources",
        chunks: [
          { n: 1, id: "a", title: "Luke", filename: "", pageNumber: null, content: "", ref: "Luke 22:54-62" },
          { n: 2, id: "b", title: "John", filename: "", pageNumber: null, content: "", ref: "John 21:15-19" },
        ],
        figures: [{ id: "peter", name: "Peter", summary: "", kind: "scripture" }],
      },
      { type: "delta", text: "Peter denied Jesus [1]." },
      { type: "done" },
    ]),
  );
  const [msg, ...rest] = storyMessages(result, "en");
  assert.equal(rest.length, 0);
  assert.match(msg, /<i>Peter<\/i>/);
  assert.match(msg, /\[1\] Luke 22:54-62/);
  assert.doesNotMatch(msg, /John 21/);
  assert.match(msg, /href="https:\/\/[^"]+\/people\/peter">Peter<\/a>/);
  assert.match(storyMessages(result, "am")[0], /\/people\/peter">ጴጥሮስ<\/a>/);
});

test("crisis replies put the phone numbers first", async () => {
  const result = await collectStream(
    from([
      {
        type: "crisis",
        crisis: {
          kind: "self_harm",
          message: "Please stay with us.",
          steps: ["Call someone you trust."],
          resources: [{ name: "Ambulance", detail: "Ethiopia", phone: "907" }],
        },
      },
      { type: "done" },
    ]),
  );
  const text = crisisMessage(result.crisis!, "en");
  assert.ok(text.indexOf("907") < text.indexOf("Call someone"));
});

test("long answers are split under Telegram's limit", () => {
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ` + "x".repeat(300)).join("\n\n");
  const parts = splitMessage(long);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= MAX_MESSAGE);
  assert.equal(parts.join("\n\n"), long);
  for (const p of splitMessage("y".repeat(MAX_MESSAGE * 2 + 5))) assert.ok(p.length <= MAX_MESSAGE);
});

test("fallback message links each person's page, or is null with no one to offer", () => {
  const people = [{ id: "peter", name: "Peter", summary: "Denied Jesus three times." }];
  const en = fallbackMessage(people, "en", "busy")!;
  assert.match(en, /Many people are asking/);
  assert.match(en, /\/people\/peter">Peter<\/a>/);
  assert.match(fallbackMessage(people, "am", null)!, /\/people\/peter">ጴጥሮስ<\/a>/);
  assert.equal(fallbackMessage([], "en", null), null);
  assert.match(fallbackMessage(people, "en", "slow")!, /^You have asked a few times/);
  assert.match(fallbackMessage(people, "am", "slow")!, /^በአጭር ጊዜ ውስጥ/);
});

test("the setup key is token-bound and differs from the webhook secret", () => {
  assert.equal(setupKey("123:abc"), setupKey("123:abc"));
  assert.notEqual(setupKey("123:abc"), setupKey("123:abd"));
  assert.notEqual(setupKey("123:abc"), webhookSecret("123:abc").slice(0, 32));
});

test("the /today caption fits a Telegram photo caption and links the person's page", () => {
  for (const f of FIGURES) {
    for (const lang of ["en", "am"] as const) {
      const c = todayCaption(f, lang);
      assert.ok(c.replace(/<[^>]+>/g, "").length <= 1024, `${f.id} ${lang}`);
      assert.match(c, new RegExp(`/people/${f.id}"`));
    }
  }
});

test("the channel caption is bilingual, fits a photo caption, and links the page", () => {
  for (const f of FIGURES) {
    const c = channelCaption(f);
    assert.ok(c.replace(/<[^>]+>/g, "").length <= 1024, f.id);
    assert.match(c, new RegExp(`/people/${f.id}"`));
    assert.match(c, /የዕለቱ ታሪክ · Story of the day/);
  }
});

test("inline mode finds people by name in either language, then by struggle", async () => {
  const { inlinePeople, inlineResults, shareCaption } = await import("../src/lib/telegram");
  assert.equal(inlinePeople("peter")[0].id, "peter");
  assert.equal(inlinePeople("ጴጥሮስ")[0].id, "peter");
  const angry = inlinePeople("anger");
  assert.ok(angry.length > 0 && angry.every((f) => f.sins.some((s) => ["anger", "violence", "resentment", "murder"].includes(s))));
  assert.equal(inlinePeople("").length, 8);
  assert.deepEqual(inlinePeople("zzzz"), []);
  for (const r of inlineResults(inlinePeople(""), "am")) {
    assert.ok(r.id.length <= 64 && r.title && r.description);
  }
  for (const lang of ["en", "am"] as const) {
    const c = shareCaption(FIGURES[0], lang);
    assert.ok(c.replace(/<[^>]+>/g, "").length <= 1024);
    assert.match(c, /\/people\/david"/);
  }
});

test("every journey day fits a photo caption and says which day it is", async () => {
  const { journeyCaption } = await import("../src/lib/telegram");
  const { JOURNEY } = await import("../src/app/journey");
  JOURNEY.forEach((id, i) => {
    const f = FIGURES.find((x) => x.id === id)!;
    for (const lang of ["en", "am"] as const) {
      const c = journeyCaption(f, lang, i + 1);
      assert.ok(c.replace(/<[^>]+>/g, "").length <= 1024, `${id} ${lang}`);
      assert.match(c, new RegExp(`${i + 1}`));
      assert.match(c, new RegExp(`/people/${id}"`));
    }
  });
});

test("bot deep links start the journey or the morning story in one tap", async () => {
  const { botLink, channelCaption } = await import("../src/lib/telegram");
  assert.equal(botLink(), "https://t.me/U_not_the_only_bot");
  assert.equal(botLink("journey", "am"), "https://t.me/U_not_the_only_bot?start=journey_am");
  assert.match(channelCaption(FIGURES[0]), /\?start=journey"/);
});

test("captions still fit on the longest church days (a feast in a fast)", () => {
  const siklet = new Date("2026-04-10T09:00:00Z"); // Good Friday in Hudade
  for (const f of FIGURES) {
    assert.ok(channelCaption(f, siklet).replace(/<[^>]+>/g, "").length <= 1024, f.id);
    for (const lang of ["en", "am"] as const) assert.ok(todayCaption(f, lang, siklet).replace(/<[^>]+>/g, "").length <= 1024, `${f.id} ${lang}`);
  }
  assert.match(todayCaption(FIGURES[0], "en", siklet), /Miyazya 2, 2018 E\.C\. · Siklet, Good Friday · Hudade, the Great Lent/);
});

test("/walk: commands and deep links name a struggle group; anything else shows the choices", async () => {
  const { parseWalk, walkPeople, walkCaption, walkChoices, WALK_DAYS } = await import("../src/lib/telegram");
  assert.equal(parseWalk("/walk_lust"), "lust");
  assert.equal(parseWalk("/walk anger"), "anger");
  assert.equal(parseWalk("/start walk_despair_am"), "despair");
  assert.equal(parseWalk("/walk_lust@U_not_the_only_bot"), "lust");
  assert.equal(parseWalk("/walk"), null);
  assert.equal(parseWalk("/walk_nothing"), null);
  assert.equal(parseWalk("/walkthrough"), undefined);
  assert.equal(parseWalk("I keep lying"), undefined);
  const people = walkPeople("lust");
  assert.equal(people.length, WALK_DAYS);
  const c = walkCaption(people[0], "en", 1, people.length, "lust");
  assert.match(c, /Day 1 of 7 · Lust/);
  assert.match(c, new RegExp(`/people/${people[0].id}"`));
  assert.match(walkChoices("am"), /\/walk_lust — ፍትወት/);
});

/** Every tag closes in the order it opened (what Telegram's HTML parser demands). */
function balanced(html: string): boolean {
  const stack: string[] = [];
  for (const [, close, name] of html.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
    if (!close) stack.push(name);
    else if (stack.pop() !== name) return false;
  }
  return stack.length === 0;
}

test("markdown that overlaps bold and italic still gives balanced tags", () => {
  for (const md of ["**a *b** c*", "*a **b* c**", "**x** *y **z***", "# **Peter** *wept*", "*a* **b *c* d**"]) {
    const html = markdownToHtml(md);
    assert.ok(balanced(html), `${md} -> ${html}`);
  }
});

test("a hard cut never ends a part inside an entity", () => {
  for (let shift = 0; shift < 6; shift++) {
    const para = "a".repeat(MAX_MESSAGE - 3 + shift) + "&amp;" + "b".repeat(50);
    const parts = splitMessage(para);
    assert.ok(parts.length > 1);
    for (const p of parts) {
      assert.ok(p.length <= MAX_MESSAGE);
      assert.doesNotMatch(p, /&[a-z#0-9]*$/i, `shift ${shift}`);
    }
    assert.equal(parts.join(""), para);
  }
});

test("plain text undoes the markup and the escaping", () => {
  assert.equal(htmlToPlain("<b>Peter</b> wept &lt;bitterly&gt; &amp; <i>alone</i>"), "Peter wept <bitterly> & alone");
});

test("a part Telegram rejects is resent as plain text, keeping the keyboard", async () => {
  mock.method(console, "error", () => {});
  const bodies: Record<string, unknown>[] = [];
  mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    bodies.push(body);
    const ok = body.parse_mode === undefined;
    return Response.json(ok ? { ok: true } : { ok: false, description: "Bad Request: can't parse entities" });
  });
  const keyboard = { inline_keyboard: [] };
  await sendHtml("t", 7, "<b>Peter</b> &amp; <i>John", { reply_markup: keyboard });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].parse_mode, "HTML");
  assert.equal(bodies[1].text, "Peter & John");
  assert.equal(bodies[1].chat_id, 7);
  assert.deepEqual(bodies[1].reply_markup, keyboard);
});

test("an HTML part Telegram accepts is sent once", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ ok: true }));
  await sendHtml("t", 7, "<b>ok</b>");
  assert.equal(fetchMock.mock.callCount(), 1);
});
