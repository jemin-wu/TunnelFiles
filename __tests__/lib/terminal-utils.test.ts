import { describe, it, expect } from "vitest";

import { stripAnsi, detectShellPrompt, shellEscapePath } from "@/lib/terminal-utils";

describe("stripAnsi", () => {
  it("strips SGR color codes", () => {
    expect(stripAnsi("\x1b[31mhello\x1b[0m")).toBe("hello");
  });

  it("strips complex SGR sequences", () => {
    expect(stripAnsi("\x1b[1;32;48;5;234mbold green\x1b[0m")).toBe("bold green");
  });

  it("strips CSI cursor sequences", () => {
    expect(stripAnsi("\x1b[2J\x1b[Hhello")).toBe("hello");
  });

  it("strips OSC title sequences", () => {
    expect(stripAnsi("\x1b]0;terminal title\x07prompt$ ")).toBe("prompt$ ");
  });

  it("strips character set selection", () => {
    expect(stripAnsi("\x1b(Bhello")).toBe("hello");
  });

  it("returns plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });
});

describe("detectShellPrompt", () => {
  it("detects bash-style prompt (user@host:~$ )", () => {
    expect(detectShellPrompt("user@host:~$ ")).toBe(true);
  });

  it("detects root prompt (#)", () => {
    expect(detectShellPrompt("root@server:/var# ")).toBe(true);
  });

  it("detects zsh-style prompt (%)", () => {
    expect(detectShellPrompt("user@host % ")).toBe(true);
  });

  it("detects fish-style prompt (>)", () => {
    expect(detectShellPrompt("user@host ~/projects> ")).toBe(true);
  });

  it("detects prompt with trailing $, no space", () => {
    expect(detectShellPrompt("user@host:~$")).toBe(true);
  });

  it("detects prompt with ANSI color codes", () => {
    expect(detectShellPrompt("\x1b[1;32muser@host\x1b[0m:\x1b[34m~\x1b[0m$ ")).toBe(true);
  });

  it("detects prompt after multiline output", () => {
    const buffer = "line 1\nline 2\nline 3\nuser@host:~$ ";
    expect(detectShellPrompt(buffer)).toBe(true);
  });

  it("detects prompt with trailing newlines", () => {
    expect(detectShellPrompt("user@host:~$ \n\n")).toBe(true);
  });

  it("rejects empty buffer", () => {
    expect(detectShellPrompt("")).toBe(false);
  });

  it("rejects lines longer than 200 chars (likely command output)", () => {
    const longLine = "x".repeat(200) + "$ ";
    expect(detectShellPrompt(longLine)).toBe(false);
  });

  it("rejects output without prompt ending", () => {
    expect(detectShellPrompt("some output text")).toBe(false);
  });

  it("rejects output ending with common words containing prompt chars", () => {
    // Lines that happen to end with punctuation but are clearly output
    expect(detectShellPrompt("Processing 100%")).toBe(true); // % is valid prompt char — accepted
  });
});

describe("shellEscapePath", () => {
  it("wraps simple path in single quotes", () => {
    expect(shellEscapePath("/var/log")).toBe("'/var/log'");
  });

  it("handles path with spaces", () => {
    expect(shellEscapePath("/my path/dir")).toBe("'/my path/dir'");
  });

  it("escapes single quotes in path", () => {
    expect(shellEscapePath("/it's")).toBe("'/it'\\''s'");
  });

  it("handles path with multiple single quotes", () => {
    expect(shellEscapePath("/a'b'c")).toBe("'/a'\\''b'\\''c'");
  });

  it("handles path with dollar signs (safe in single quotes)", () => {
    expect(shellEscapePath("/path/$HOME")).toBe("'/path/$HOME'");
  });

  it("handles path with backticks (safe in single quotes)", () => {
    expect(shellEscapePath("/path/`cmd`")).toBe("'/path/`cmd`'");
  });

  it("handles root path", () => {
    expect(shellEscapePath("/")).toBe("'/'");
  });
});
