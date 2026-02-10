/**
 * Platform detection utilities for cross-platform keyboard shortcut display
 */

/** Check if running on macOS */
export function isMac(): boolean {
  return /Mac/.test(navigator.userAgent);
}

/** Format keyboard shortcut for current platform
 * Converts platform-agnostic shortcut notation to OS-specific display.
 * - "Mod" → ⌘ (Mac) or "Ctrl+" (Win/Linux)
 * - "Backspace" → ⌫ (Mac) or "Backspace" (Win/Linux)
 * - "Delete" → ⌫ (Mac) or "Del" (Win/Linux)
 */
export function formatShortcut(shortcut: string): string {
  const mac = isMac();
  return shortcut
    .replace(/\bMod\+/g, mac ? "\u2318" : "Ctrl+")
    .replace(/\bBackspace\b/g, mac ? "\u232B" : "Backspace")
    .replace(/\bDelete\b/g, mac ? "\u232B" : "Del");
}
