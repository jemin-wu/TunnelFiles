import React, { useEffect, useState } from "react";
import { codeToHtml, type BundledLanguage } from "shiki/bundle/web";

import { cn } from "@/lib/utils";

export type CodeBlockProps = {
  children?: React.ReactNode;
  className?: string;
} & React.HTMLProps<HTMLDivElement>;

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose border-border bg-card text-card-foreground flex w-full flex-col overflow-clip rounded-md border",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type CodeBlockCodeProps = {
  code: string;
  language?: string;
  className?: string;
} & React.HTMLProps<HTMLDivElement>;

/**
 * 显式列出项目实际会走高亮的语言 —— 尽量收窄集合以减小 bundle size。
 * 其余 lang（rust / go / dockerfile / toml / diff 等）落到 `bash` 兜底；
 * shiki 加载失败时 `useEffect` 会 catch，降级为纯 `<pre>` 展示。
 */
const SUPPORTED_LANGS: ReadonlySet<string> = new Set([
  "bash",
  "shell",
  "zsh",
  "sh",
  "shellscript",
  "python",
  "py",
  "javascript",
  "js",
  "typescript",
  "ts",
  "json",
  "jsonc",
  "html",
  "css",
  "md",
  "markdown",
  "jsx",
  "tsx",
  "yaml",
  "yml",
  "sql",
]);

function normalizeLanguage(language: string): BundledLanguage {
  const lower = language.toLowerCase();
  if (SUPPORTED_LANGS.has(lower)) {
    return lower as BundledLanguage;
  }
  return "bash";
}

interface HighlightedCode {
  cacheKey: string;
  html: string;
}

function CodeBlockCode({ code, language = "bash", className, ...props }: CodeBlockCodeProps) {
  const [highlightedCode, setHighlightedCode] = useState<HighlightedCode | null>(null);
  const cacheKey = `${language}\0${code}`;

  useEffect(() => {
    let cancelled = false;
    if (!code) return;
    (async () => {
      try {
        const html = await codeToHtml(code, {
          lang: normalizeLanguage(language),
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
        });
        if (!cancelled) setHighlightedCode({ cacheKey, html });
      } catch {
        // shiki 加载失败（lang 不支持等）→ 保持未高亮，降级为纯 <pre>
        if (!cancelled) setHighlightedCode(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, code, language]);

  const classNames = cn(
    "w-full overflow-x-auto font-mono text-xs [&>pre]:px-3 [&>pre]:py-2",
    className
  );
  const highlightedHtml = highlightedCode?.cacheKey === cacheKey ? highlightedCode.html : null;

  return highlightedHtml ? (
    <div className={classNames} dangerouslySetInnerHTML={{ __html: highlightedHtml }} {...props} />
  ) : (
    <div className={classNames} {...props}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>;

function CodeBlockGroup({ children, className, ...props }: CodeBlockGroupProps) {
  return (
    <div className={cn("flex items-center justify-between", className)} {...props}>
      {children}
    </div>
  );
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock };
