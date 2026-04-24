import { describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { codeToHtml } from "shiki/bundle/web";

import { CodeBlockCode } from "@/components/prompt-kit/code-block";

vi.mock("shiki/bundle/web", () => ({
  codeToHtml: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("CodeBlockCode", () => {
  it("clears stale highlighted HTML while new code is highlighting", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    vi.mocked(codeToHtml).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { rerender } = render(<CodeBlockCode code="old-command" language="bash" />);

    await act(async () => {
      first.resolve("<pre><code>old-highlight</code></pre>");
      await first.promise;
    });
    expect(await screen.findByText("old-highlight")).toBeInTheDocument();

    rerender(<CodeBlockCode code="new-command" language="bash" />);

    expect(screen.queryByText("old-highlight")).not.toBeInTheDocument();
    expect(screen.getByText("new-command")).toBeInTheDocument();

    await act(async () => {
      second.reject(new Error("highlight failed"));
      await second.promise.catch(() => undefined);
    });

    await waitFor(() => {
      expect(screen.queryByText("old-highlight")).not.toBeInTheDocument();
      expect(screen.getByText("new-command")).toBeInTheDocument();
    });
  });
});
