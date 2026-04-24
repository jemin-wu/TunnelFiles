import { useMemo } from "react";
import ReactDiffViewer from "react-diff-viewer-continued";

interface PlanDiffViewerProps {
  diff: string;
}

function splitUnifiedDiff(diff: string) {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let sawHunk = false;

  for (const line of diff.split("\n")) {
    if (line.startsWith("---") || line.startsWith("+++")) continue;
    if (line.startsWith("@@")) {
      sawHunk = true;
      continue;
    }
    if (line.startsWith("+")) {
      newLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith("-")) {
      oldLines.push(line.slice(1));
      continue;
    }
    const normalized = line.startsWith(" ") ? line.slice(1) : line;
    oldLines.push(normalized);
    newLines.push(normalized);
  }

  if (!sawHunk) {
    return { oldValue: diff, newValue: diff };
  }

  return {
    oldValue: oldLines.join("\n"),
    newValue: newLines.join("\n"),
  };
}

export function PlanDiffViewer({ diff }: PlanDiffViewerProps) {
  const { oldValue, newValue } = useMemo(() => splitUnifiedDiff(diff), [diff]);
  const useDarkTheme =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div data-slot="plan-diff-viewer" className="border-border/60 overflow-auto rounded-md border">
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView={false}
        useDarkTheme={useDarkTheme}
        hideLineNumbers={false}
        showDiffOnly={false}
        styles={{
          variables: {
            light: {
              diffViewerBackground: "oklch(0.985 0 0)",
              addedBackground: "oklch(0.96 0.06 151)",
              addedColor: "oklch(0.38 0.12 151)",
              removedBackground: "oklch(0.96 0.05 20)",
              removedColor: "oklch(0.42 0.14 20)",
              wordAddedBackground: "oklch(0.9 0.09 151)",
              wordRemovedBackground: "oklch(0.9 0.09 20)",
              addedGutterBackground: "oklch(0.95 0.05 151)",
              removedGutterBackground: "oklch(0.95 0.05 20)",
              gutterBackground: "oklch(0.965 0 0)",
              gutterBackgroundDark: "oklch(0.18 0 0)",
              gutterColor: "oklch(0.5 0 0)",
            },
            dark: {
              diffViewerBackground: "oklch(0.19 0 0)",
              addedBackground: "oklch(0.3 0.07 151)",
              addedColor: "oklch(0.87 0.08 151)",
              removedBackground: "oklch(0.28 0.07 20)",
              removedColor: "oklch(0.88 0.08 20)",
              wordAddedBackground: "oklch(0.36 0.09 151)",
              wordRemovedBackground: "oklch(0.34 0.09 20)",
              addedGutterBackground: "oklch(0.24 0.05 151)",
              removedGutterBackground: "oklch(0.23 0.05 20)",
              gutterBackground: "oklch(0.16 0 0)",
              gutterBackgroundDark: "oklch(0.14 0 0)",
              gutterColor: "oklch(0.72 0 0)",
            },
          },
          contentText: {
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', monospace)",
            fontSize: "11px",
            lineHeight: "1.55",
          },
          lineNumber: {
            minWidth: "30px",
          },
        }}
      />
    </div>
  );
}
