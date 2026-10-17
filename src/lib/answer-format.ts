export type AnswerSource = { title: string; url: string; number?: number };
export type AnswerInlinePart =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "citation"; number: number; source?: AnswerSource };
export type AnswerBlock = { type: "paragraph"; parts: AnswerInlinePart[] } | { type: "list"; items: AnswerInlinePart[][] };

function unescapeMarkdown(value: string) {
  return value.replace(/\\([\\`*_{}\[\]()#+.!|>~-])/g, "$1");
}

function inlineParts(value: string, sourceByNumber: Map<number, AnswerSource>): AnswerInlinePart[] {
  const parts: AnswerInlinePart[] = [];
  const pattern = /\*\*([^*]+)\*\*|__([^_]+)__|\[(\d+)\]/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ type: "text", text: value.slice(cursor, index) });
    if (match[1] || match[2]) parts.push({ type: "strong", text: match[1] ?? match[2] });
    else {
      const oldNumber = Number(match[3]);
      const source = sourceByNumber.get(oldNumber);
      parts.push({ type: "citation", number: source?.number ?? oldNumber, source });
    }
    cursor = index + match[0].length;
  }
  if (cursor < value.length) parts.push({ type: "text", text: value.slice(cursor) });
  return parts;
}

export function formatAnswer(answer: string, sources: AnswerSource[] = []) {
  const sortedSources = sources
    .map((source, index) => ({ ...source, number: source.number ?? index + 1 }))
    .sort((a, b) => a.number! - b.number!);
  const sourceByNumber = new Map<number, AnswerSource>();
  const compactSources = sortedSources.map((source, index) => {
    const compact = { ...source, number: index + 1 };
    sourceByNumber.set(source.number!, compact);
    return compact;
  });

  const lines = unescapeMarkdown(answer).replace(/\r\n?/g, "\n").split("\n");
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", parts: inlineParts(text, sourceByNumber) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: "list", items: list.map(item => inlineParts(item, sourceByNumber)) });
    list = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
    } else if (!line) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return { blocks, sources: compactSources };
}
