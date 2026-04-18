/**
 * Lightweight markdown fence parser for assistant chat messages.
 *
 * Splits text into alternating `text` / `code` blocks at triple-backtick
 * fences (`` ``` ``). The fence regex is line-anchored — only complete
 * blocks of the form
 *
 * ```bash
 * echo hi
 * ```
 *
 * count. Inline backticks and partially-streamed code blocks (open fence
 * without a matching close) stay inside text blocks until the closing
 * fence arrives. This avoids "code block flicker" mid-stream.
 *
 * No markdown beyond fences is interpreted — tables, lists, links etc.
 * remain plain text. The ChatInput "Insert to terminal" button only
 * cares about runnable code blocks, which is the only piece this slice
 * needs to render distinctly.
 */

export type MessageBlock =
  | { kind: "text"; content: string }
  | { kind: "code"; language: string; content: string };

/**
 * Match a complete fenced code block starting at line beginning:
 *   ```[lang]\n
 *   ...content...
 *   ```
 *
 * - `^...$` with `m` flag: line-anchored (closing ``` on its own line)
 * - `[a-zA-Z0-9_+-]*`: optional language identifier (bash, sh, py, c++ ...)
 * - `[\s\S]*?`: any chars including newlines, non-greedy
 */
const FENCE = /^```([a-zA-Z0-9_+-]*)\n([\s\S]*?)^```$/gm;

export function parseMessageBlocks(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  if (text.length === 0) return blocks;

  // /g flag means we must reset state per call (regex is module-level)
  FENCE.lastIndex = 0;
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE.exec(text)) !== null) {
    if (match.index > lastEnd) {
      blocks.push({ kind: "text", content: text.slice(lastEnd, match.index) });
    }
    blocks.push({
      kind: "code",
      language: match[1] ?? "",
      content: match[2],
    });
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd < text.length) {
    blocks.push({ kind: "text", content: text.slice(lastEnd) });
  }
  return blocks;
}

/** 可注入到 shell 的代码块语言。空字符串视为通用 shell（保守接受）。 */
export const INSERTABLE_LANGUAGES: ReadonlySet<string> = new Set([
  "",
  "bash",
  "sh",
  "shell",
  "zsh",
]);

export function isInsertableLanguage(lang: string): boolean {
  return INSERTABLE_LANGUAGES.has(lang.toLowerCase());
}
