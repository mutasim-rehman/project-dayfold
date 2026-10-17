import { describe, expect, it } from "vitest";
import { formatAnswer } from "@/lib/answer-format";

describe("Ask answer formatting", () => {
  it("turns escaped markdown into readable bold text and bullet items", () => {
    const answer = [
      String.raw`\- \*\*AI and infrastructure\*\*: A new report explores the topic [1].`,
      String.raw`\- \*\*Privacy\*\*: Another story covers it [2].`,
    ].join("\n");
    const formatted = formatAnswer(answer);
    expect(formatted.blocks).toHaveLength(1);
    expect(formatted.blocks[0]).toMatchObject({ type: "list", items: expect.any(Array) });
    if (formatted.blocks[0].type === "list") {
      expect(formatted.blocks[0].items).toHaveLength(2);
      expect(formatted.blocks[0].items[0]).toContainEqual({ type: "strong", text: "AI and infrastructure" });
      expect(formatted.blocks[0].items[1]).toContainEqual({ type: "strong", text: "Privacy" });
    }
  });

  it("compacts skipped source numbers and maps inline citations to matching links", () => {
    const formatted = formatAnswer("Story one [1].\n\nStory two [5].", [
      { number: 1, title: "First", url: "https://example.com/1" },
      { number: 5, title: "Fifth", url: "https://example.com/5" },
    ]);
    expect(formatted.sources.map(source => source.number)).toEqual([1, 2]);
    expect(formatted.blocks[0].type).toBe("paragraph");
    expect(formatted.blocks[1].type).toBe("paragraph");
    if (formatted.blocks[1].type === "paragraph") {
      expect(formatted.blocks[1].parts).toContainEqual({ type: "citation", number: 2, source: formatted.sources[1] });
    }
  });
});
