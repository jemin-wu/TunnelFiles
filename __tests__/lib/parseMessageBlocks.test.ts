import { describe, it, expect } from "vitest";
import {
  parseMessageBlocks,
  isInsertableLanguage,
  INSERTABLE_LANGUAGES,
} from "@/lib/parseMessageBlocks";

describe("parseMessageBlocks", () => {
  it("returns empty array for empty input", () => {
    expect(parseMessageBlocks("")).toEqual([]);
  });

  it("returns single text block for fence-free content", () => {
    const blocks = parseMessageBlocks("just plain prose");
    expect(blocks).toEqual([{ kind: "text", content: "just plain prose" }]);
  });

  it("extracts a single code block", () => {
    const text = "```bash\necho hi\n```";
    expect(parseMessageBlocks(text)).toEqual([
      { kind: "code", language: "bash", content: "echo hi\n" },
    ]);
  });

  it("preserves text before and after a code block", () => {
    const text = "before\n```bash\necho hi\n```\nafter";
    expect(parseMessageBlocks(text)).toEqual([
      { kind: "text", content: "before\n" },
      { kind: "code", language: "bash", content: "echo hi\n" },
      { kind: "text", content: "\nafter" },
    ]);
  });

  it("handles multiple fenced blocks", () => {
    const text = "```sh\nls\n```\n\nthen\n\n```\nfree text\n```";
    const blocks = parseMessageBlocks(text);
    expect(blocks.length).toBe(3);
    expect(blocks[0]).toEqual({ kind: "code", language: "sh", content: "ls\n" });
    expect(blocks[1].kind).toBe("text");
    expect(blocks[2]).toEqual({ kind: "code", language: "", content: "free text\n" });
  });

  it("treats a fenced block with no language as language-empty (not bash)", () => {
    const blocks = parseMessageBlocks("```\nhi\n```");
    expect(blocks).toEqual([{ kind: "code", language: "", content: "hi\n" }]);
  });

  it("ignores triple-backticks that are not at line start (inline)", () => {
    // 不在行首的 ``` 不应被识别为 fence
    const text = "see ```bash echo hi``` here";
    const blocks = parseMessageBlocks(text);
    expect(blocks.length).toBe(1);
    expect(blocks[0].kind).toBe("text");
  });

  it("ignores partial fence (open without matching close) — stays text", () => {
    const text = "intro\n```bash\necho streaming...";
    const blocks = parseMessageBlocks(text);
    expect(blocks.length).toBe(1);
    expect(blocks[0].kind).toBe("text");
  });

  it("does not consume content after an unclosed fence as code on next call", () => {
    // 防 regex /g flag 的 lastIndex 跨调用泄漏
    const partial = "intro\n```bash\necho ...";
    parseMessageBlocks(partial);
    const complete = "```sh\nls\n```";
    const blocks = parseMessageBlocks(complete);
    expect(blocks).toEqual([{ kind: "code", language: "sh", content: "ls\n" }]);
  });

  it("preserves multi-line content inside code block", () => {
    const text = "```bash\nset -e\nrm -rf /tmp/foo\nexit 0\n```";
    const blocks = parseMessageBlocks(text);
    expect(blocks).toEqual([
      {
        kind: "code",
        language: "bash",
        content: "set -e\nrm -rf /tmp/foo\nexit 0\n",
      },
    ]);
  });

  it("preserves leading whitespace inside code block", () => {
    const text = "```\n  indented line\n\ttab line\n```";
    const blocks = parseMessageBlocks(text);
    expect(blocks).toEqual([
      { kind: "code", language: "", content: "  indented line\n\ttab line\n" },
    ]);
  });

  it("captures language with hyphens / underscores / pluses", () => {
    expect(parseMessageBlocks("```c++\nmain\n```")[0]).toEqual({
      kind: "code",
      language: "c++",
      content: "main\n",
    });
    expect(parseMessageBlocks("```my-lang\nx\n```")[0]).toMatchObject({
      language: "my-lang",
    });
  });
});

describe("isInsertableLanguage", () => {
  it("accepts bash / sh / shell / zsh / empty", () => {
    for (const lang of ["", "bash", "sh", "shell", "zsh"]) {
      expect(isInsertableLanguage(lang)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isInsertableLanguage("BASH")).toBe(true);
    expect(isInsertableLanguage("Sh")).toBe(true);
  });

  it("rejects non-shell languages", () => {
    expect(isInsertableLanguage("python")).toBe(false);
    expect(isInsertableLanguage("javascript")).toBe(false);
    expect(isInsertableLanguage("yaml")).toBe(false);
  });

  it("INSERTABLE_LANGUAGES set is consistent with the helper", () => {
    for (const lang of INSERTABLE_LANGUAGES) {
      expect(isInsertableLanguage(lang)).toBe(true);
    }
  });
});
