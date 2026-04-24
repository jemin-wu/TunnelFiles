import { describe, it, expect, beforeEach } from "vitest";
import { createAiSessionStore, type ChatSession } from "@/stores/useAiSessionStore";
import type { AiPlan } from "@/types/bindings/AiPlan";

type Store = ReturnType<typeof createAiSessionStore>;

function getState(store: Store) {
  return store.getState();
}

const demoPlan: AiPlan = {
  summary: "检查 nginx",
  steps: [
    {
      id: "step-1",
      kind: "probe",
      status: "pending",
      intent: "读取配置",
      command: "cat /etc/nginx/nginx.conf",
      path: null,
      content: null,
      targetFiles: [],
      verifyTemplate: null,
      expectedObservation: "看到配置",
    },
  ],
  risks: [],
  assumptions: [],
  status: "ready",
};

describe("useAiSessionStore", () => {
  let store: Store;

  beforeEach(() => {
    store = createAiSessionStore();
  });

  describe("selectors", () => {
    it("returns undefined session for unknown id", () => {
      expect(getState(store).getSession("tab-1")).toBeUndefined();
    });

    it("returns 'idle' streamState for unknown session (safe default)", () => {
      expect(getState(store).getStreamState("tab-1")).toBe("idle");
    });
  });

  describe("appendUserMessage", () => {
    it("creates session lazily and stores message", () => {
      const id = getState(store).appendUserMessage("tab-1", "hi");
      const session = getState(store).getSession("tab-1")!;
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toMatchObject({ id, role: "user", content: "hi" });
    });

    it("returns distinct ids for subsequent messages", () => {
      const a = getState(store).appendUserMessage("tab-1", "hi");
      const b = getState(store).appendUserMessage("tab-1", "there");
      expect(a).not.toBe(b);
    });

    it("clears previous error state on new user message", () => {
      getState(store).failStream("tab-1", "boom");
      getState(store).appendUserMessage("tab-1", "retry");
      const session = getState(store).getSession("tab-1")!;
      expect(session.error).toBeNull();
    });
  });

  describe("streaming lifecycle", () => {
    it("beginThinking moves state to 'thinking' and reserves assistant message", () => {
      getState(store).appendUserMessage("tab-1", "hi");
      const assistantId = getState(store).beginThinking("tab-1");
      const session = getState(store).getSession("tab-1")!;
      expect(session.streamState).toBe("thinking");
      expect(session.pendingAssistantId).toBe(assistantId);
      const assistant = session.messages.find((m) => m.id === assistantId);
      expect(assistant).toMatchObject({ role: "assistant", content: "" });
    });

    it("first appendAssistantToken flips thinking → streaming", () => {
      getState(store).appendUserMessage("tab-1", "hi");
      getState(store).beginThinking("tab-1");
      getState(store).appendAssistantToken("tab-1", "He");
      expect(getState(store).getStreamState("tab-1")).toBe("streaming");
    });

    it("appendAssistantToken accumulates content onto pending assistant", () => {
      getState(store).appendUserMessage("tab-1", "hi");
      const assistantId = getState(store).beginThinking("tab-1");
      getState(store).appendAssistantToken("tab-1", "Hel");
      getState(store).appendAssistantToken("tab-1", "lo!");
      const session = getState(store).getSession("tab-1")!;
      const assistant = session.messages.find((m) => m.id === assistantId)!;
      expect(assistant.content).toBe("Hello!");
    });

    it("ignores tokens when no pending assistant (stray event)", () => {
      getState(store).appendUserMessage("tab-1", "hi");
      getState(store).appendAssistantToken("tab-1", "ghost");
      const session = getState(store).getSession("tab-1")!;
      expect(session.messages).toHaveLength(1);
      expect(session.streamState).toBe("idle");
    });

    it("completeStream resets to idle and clears pending id", () => {
      getState(store).appendUserMessage("tab-1", "hi");
      getState(store).beginThinking("tab-1");
      getState(store).appendAssistantToken("tab-1", "Hi.");
      getState(store).completeStream("tab-1");
      const session = getState(store).getSession("tab-1")!;
      expect(session.streamState).toBe("idle");
      expect(session.pendingAssistantId).toBeNull();
      expect(session.messages).toHaveLength(2); // user + assistant
    });

    it("failStream sets error and state but keeps received tokens", () => {
      getState(store).appendUserMessage("tab-1", "hi");
      getState(store).beginThinking("tab-1");
      getState(store).appendAssistantToken("tab-1", "partial");
      getState(store).failStream("tab-1", "ipc dropped");
      const session = getState(store).getSession("tab-1")!;
      expect(session.streamState).toBe("error");
      expect(session.error).toBe("ipc dropped");
      const assistant = session.messages.find((m) => m.role === "assistant")!;
      expect(assistant.content).toBe("partial");
    });
  });

  describe("per-tab isolation", () => {
    it("changes to tab-A do not affect tab-B", () => {
      getState(store).appendUserMessage("tab-A", "from A");
      getState(store).beginThinking("tab-A");
      getState(store).appendAssistantToken("tab-A", "A reply");

      const before: ChatSession | undefined = getState(store).getSession("tab-B");
      expect(before).toBeUndefined();

      getState(store).appendUserMessage("tab-B", "from B");
      const a = getState(store).getSession("tab-A")!;
      const b = getState(store).getSession("tab-B")!;
      expect(a.messages).toHaveLength(2); // user + assistant
      expect(b.messages).toHaveLength(1);
      expect(b.streamState).toBe("idle");
    });
  });

  describe("setProbeQueuePosition", () => {
    it("sets probeQueuePosition for an existing session", () => {
      getState(store).appendUserMessage("tab-1", "hi");
      getState(store).setProbeQueuePosition("tab-1", 2);
      expect(getState(store).getSession("tab-1")!.probeQueuePosition).toBe(2);
    });

    it("position=0 clears probeQueuePosition to null", () => {
      getState(store).appendUserMessage("tab-1", "hi");
      getState(store).setProbeQueuePosition("tab-1", 3);
      getState(store).setProbeQueuePosition("tab-1", 0);
      expect(getState(store).getSession("tab-1")!.probeQueuePosition).toBeNull();
    });

    it("creates session lazily if not yet seen", () => {
      getState(store).setProbeQueuePosition("tab-new", 1);
      expect(getState(store).getSession("tab-new")!.probeQueuePosition).toBe(1);
    });

    it("new session starts with probeQueuePosition = null", () => {
      getState(store).appendUserMessage("tab-1", "hi");
      expect(getState(store).getSession("tab-1")!.probeQueuePosition).toBeNull();
    });
  });

  describe("plan event lifecycle", () => {
    it("marks the plan failed when a step failure event arrives", () => {
      getState(store).upsertPlan("tab-plan", "plan-1", demoPlan, "step-1");

      getState(store).applyPlanStepEvent("tab-plan", {
        sessionId: "tab-plan",
        planId: "plan-1",
        stepId: "step-1",
        stepIndex: 0,
        kind: "probe",
        status: "failed",
        stdout: null,
        stderr: null,
        exitCode: null,
        message: "probe 前置检查失败",
      });

      const stored = getState(store).getSession("tab-plan")!.plans[0];
      expect(stored.plan.status).toBe("failed");
      expect(stored.plan.steps[0].status).toBe("failed");
      expect(stored.currentStepId).toBe("step-1");
    });
  });

  describe("housekeeping", () => {
    it("resetSession clears messages but keeps entry", () => {
      getState(store).appendUserMessage("tab-1", "hi");
      getState(store).resetSession("tab-1");
      const session = getState(store).getSession("tab-1")!;
      expect(session.messages).toEqual([]);
      expect(session.streamState).toBe("idle");
    });

    it("resetSession on unknown tab is a no-op", () => {
      getState(store).resetSession("ghost");
      expect(getState(store).getSession("ghost")).toBeUndefined();
    });

    it("removeSession deletes entry entirely", () => {
      getState(store).appendUserMessage("tab-1", "hi");
      getState(store).removeSession("tab-1");
      expect(getState(store).getSession("tab-1")).toBeUndefined();
    });

    it("removeSession on unknown tab is a no-op", () => {
      getState(store).removeSession("ghost");
      // no throw
    });
  });
});
