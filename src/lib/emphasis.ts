/**
 * The answer's light markdown as styled runs, for the website. The model
 * sometimes writes `**David**`, `*wept*` or a `# heading`; the Telegram bot
 * turns those into bold and italics (markdownToHtml in telegram.ts), and the
 * site does the same here instead of printing the asterisks. Plain runs, never
 * HTML: React renders them, so nothing in an answer can become markup.
 */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

// A heading line, or **bold** within one line.
const STRONG = /^#{1,6}[ \t]*(.+)$|\*\*(.+?)\*\*/gm;
// *italic* within one line: not touching another *, not opening on a space.
const ITALIC = /(?<!\*)\*(?!\s)([^*\n]+?)\*(?!\*)/g;

function italics(text: string, bold: boolean): Run[] {
  const out: Run[] = [];
  let last = 0;
  for (const m of text.matchAll(ITALIC)) {
    if (m.index > last) out.push(run(text.slice(last, m.index), bold, false));
    out.push(run(m[1], bold, true));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(run(text.slice(last), bold, false));
  return out;
}

function run(text: string, bold: boolean, italic: boolean): Run {
  return { text, ...(bold ? { bold } : {}), ...(italic ? { italic } : {}) };
}

/**
 * `text` as runs whose concatenated text is the answer without its emphasis
 * marks. An unclosed `**` (as while an answer streams in) stays as written
 * until its closing marks arrive.
 */
export function emphasisRuns(text: string): Run[] {
  const out: Run[] = [];
  let last = 0;
  for (const m of text.matchAll(STRONG)) {
    if (m.index > last) out.push(...italics(text.slice(last, m.index), false));
    // A heading's own ** marks are dropped: the whole line is bold already.
    const inner = m[1] !== undefined ? m[1].replace(/\*\*/g, "").trimEnd() : m[2];
    out.push(...italics(inner, true));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...italics(text.slice(last), false));
  return out.filter((r) => r.text);
}
