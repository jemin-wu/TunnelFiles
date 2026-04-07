/**
 * Terminal utility functions
 *
 * ANSI stripping, shell prompt detection, and path escaping
 * for terminal directory sync feature.
 */

// Matches CSI sequences (ESC[...X), OSC sequences (ESC]...BEL/ST), and other escape codes
const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\x1b\x9b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|\x1b\][^\x07]*\x07|\x1b[()][AB012]/g;

// Common shell prompt endings: $ # % > ❯ (optionally followed by whitespace)
const PROMPT_ENDING_REGEX = /[$#%>❯]\s*$/;

// Max prompt line length — longer lines are likely command output, not prompts
const MAX_PROMPT_LINE_LENGTH = 200;

/**
 * Strip ANSI escape sequences from terminal output.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

/**
 * Detect if the terminal output buffer ends with a shell prompt.
 *
 * Strips ANSI codes, finds the last non-empty line, and checks
 * if it matches common prompt patterns (ends with $ # % > ❯).
 */
export function detectShellPrompt(buffer: string): boolean {
  const stripped = stripAnsi(buffer);

  // Get last non-empty line
  const lines = stripped.split("\n");
  let lastLine = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trimEnd();
    if (trimmed.length > 0) {
      lastLine = trimmed;
      break;
    }
  }

  if (lastLine.length === 0 || lastLine.length > MAX_PROMPT_LINE_LENGTH) {
    return false;
  }

  return PROMPT_ENDING_REGEX.test(lastLine);
}

/**
 * Escape a path for safe use in a single-quoted shell argument.
 *
 * Wraps the path in single quotes, escaping any embedded single quotes
 * using the '\'' idiom (close quote, escaped quote, reopen quote).
 *
 * @example
 * shellEscapePath("/var/log")          // "'/var/log'"
 * shellEscapePath("/path/with space")  // "'/path/with space'"
 * shellEscapePath("/it's")             // "'/it'\\''s'"
 */
export function shellEscapePath(path: string): string {
  return "'" + path.replace(/'/g, "'\\''") + "'";
}
