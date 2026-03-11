import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JobStore } from "./job-store.js";

describe("JobStore", () => {
  let store: JobStore;

  beforeEach(() => {
    store = new JobStore();
  });

  afterEach(() => {
    store.clear();
  });

  describe("submit", () => {
    it("assigns a taskId that starts with 't-'", () => {
      const job = store.submit({
        agentId: "research",
        agentName: "Research",
        userMessage: "find me docs on TypeScript",
      });
      expect(job.taskId).toMatch(/^t-[0-9a-f]{8}$/);
    });

    it("initialises status as 'queued'", () => {
      const job = store.submit({ agentId: "a", agentName: "A", userMessage: "hello" });
      expect(job.status).toBe("queued");
    });

    it("stores the original userMessage", () => {
      const msg = "translate this to Spanish";
      const job = store.submit({ agentId: "translate", agentName: "Translate", userMessage: msg });
      expect(job.userMessage).toBe(msg);
    });

    it("increments the size counter", () => {
      expect(store.size).toBe(0);
      store.submit({ agentId: "a", agentName: "A", userMessage: "hi" });
      expect(store.size).toBe(1);
      store.submit({ agentId: "b", agentName: "B", userMessage: "hey" });
      expect(store.size).toBe(2);
    });

    it("generates unique task IDs across multiple submissions", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const job = store.submit({ agentId: "x", agentName: "X", userMessage: String(i) });
        ids.add(job.taskId);
      }
      expect(ids.size).toBe(50);
    });
  });

  describe("getByTaskId", () => {
    it("returns the job when found", () => {
      const submitted = store.submit({ agentId: "a", agentName: "A", userMessage: "test" });
      const found = store.getByTaskId(submitted.taskId);
      expect(found).toBeDefined();
      expect(found?.taskId).toBe(submitted.taskId);
    });

    it("returns undefined for unknown task IDs", () => {
      expect(store.getByTaskId("t-00000000")).toBeUndefined();
    });

    it("is case-insensitive on the taskId", () => {
      const submitted = store.submit({ agentId: "a", agentName: "A", userMessage: "test" });
      const upper = submitted.taskId.toUpperCase();
      const found = store.getByTaskId(upper);
      expect(found).toBeDefined();
    });
  });

  describe("getByAgentId", () => {
    it("returns jobs for the specified agent, newest-first", () => {
      store.submit({ agentId: "research", agentName: "Research", userMessage: "q1" });
      store.submit({ agentId: "translate", agentName: "Translate", userMessage: "q2" });
      store.submit({ agentId: "research", agentName: "Research", userMessage: "q3" });
      const results = store.getByAgentId("research");
      expect(results).toHaveLength(2);
      // Newest first — q3 was submitted last
      expect(results[0]?.userMessage).toBe("q3");
      expect(results[1]?.userMessage).toBe("q1");
    });

    it("returns an empty array when no jobs exist for the agent", () => {
      expect(store.getByAgentId("nonexistent")).toEqual([]);
    });

    it("is case-insensitive on the agentId", () => {
      store.submit({ agentId: "Research", agentName: "Research", userMessage: "hi" });
      expect(store.getByAgentId("research")).toHaveLength(1);
    });
  });

  describe("listAll", () => {
    it("returns all jobs newest-first", () => {
      store.submit({ agentId: "a", agentName: "A", userMessage: "first" });
      store.submit({ agentId: "b", agentName: "B", userMessage: "second" });
      const all = store.listAll();
      expect(all).toHaveLength(2);
      expect(all[0]?.userMessage).toBe("second");
    });

    it("returns empty array when store is empty", () => {
      expect(store.listAll()).toEqual([]);
    });
  });

  describe("updateStatus", () => {
    it("transitions status from queued to running", () => {
      const job = store.submit({ agentId: "a", agentName: "A", userMessage: "test" });
      const ok = store.updateStatus(job.taskId, "running");
      expect(ok).toBe(true);
      expect(store.getByTaskId(job.taskId)?.status).toBe("running");
    });

    it("sets completedAt when status transitions to done", () => {
      const before = Date.now();
      const job = store.submit({ agentId: "a", agentName: "A", userMessage: "test" });
      store.updateStatus(job.taskId, "done");
      const found = store.getByTaskId(job.taskId);
      expect(found?.completedAt).toBeGreaterThanOrEqual(before);
    });

    it("sets completedAt and error when status transitions to error", () => {
      const job = store.submit({ agentId: "a", agentName: "A", userMessage: "test" });
      store.updateStatus(job.taskId, "error", "LLM timeout");
      const found = store.getByTaskId(job.taskId);
      expect(found?.status).toBe("error");
      expect(found?.completedAt).toBeDefined();
      expect(found?.error).toBe("LLM timeout");
    });

    it("returns false for unknown task IDs", () => {
      const ok = store.updateStatus("t-unknown0", "done");
      expect(ok).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all jobs", () => {
      store.submit({ agentId: "a", agentName: "A", userMessage: "1" });
      store.submit({ agentId: "b", agentName: "B", userMessage: "2" });
      store.clear();
      expect(store.size).toBe(0);
    });
  });
});
