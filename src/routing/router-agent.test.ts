import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { RouterAgentConfig } from "../config/types.agents.js";
import type { JobEntry } from "./job-store.js";
import {
  formatAgentTasksReply,
  formatAllTasksReply,
  formatJobStatusReply,
  formatTaskAcceptedReply,
  formatTaskNotFoundReply,
  parseRouterStatusQuery,
  resolveRouterTarget,
} from "./router-agent.js";

// ── Minimal config helpers ───────────────────────────────────────────────────

function makeCfg(agents: Array<{ id: string; name?: string }>): OpenClawConfig {
  return {
    agents: {
      list: agents.map((a) => ({ id: a.id, name: a.name })),
    },
  } as unknown as OpenClawConfig;
}

function makeJob(overrides: Partial<JobEntry> = {}): JobEntry {
  return {
    taskId: "t-abc12345",
    agentId: "research",
    agentName: "Research",
    userMessage: "find TypeScript docs",
    submittedAt: Date.now() - 30_000,
    seq: 0,
    status: "done",
    ...overrides,
  };
}

// ── resolveRouterTarget ──────────────────────────────────────────────────────

describe("resolveRouterTarget", () => {
  const cfg = makeCfg([
    { id: "research", name: "Research" },
    { id: "translate", name: "Translate" },
    { id: "default-agent", name: "Default" },
  ]);

  it("returns null when no rules and no defaultAgentId", () => {
    const routerConfig: RouterAgentConfig = { enabled: true };
    const result = resolveRouterTarget({ cfg, routerConfig, message: "hello" });
    expect(result).toBeNull();
  });

  it("matches a keyword rule (case-insensitive)", () => {
    const routerConfig: RouterAgentConfig = {
      enabled: true,
      rules: [{ agentId: "research", keywords: ["research", "find", "search"] }],
    };
    const result = resolveRouterTarget({
      cfg,
      routerConfig,
      message: "Please RESEARCH this topic",
    });
    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("research");
    expect(result?.matched).toBe("rule");
  });

  it("matches a regex pattern rule", () => {
    const routerConfig: RouterAgentConfig = {
      enabled: true,
      rules: [{ agentId: "translate", pattern: "^translate\\s+" }],
    };
    const result = resolveRouterTarget({
      cfg,
      routerConfig,
      message: "translate this to French",
    });
    expect(result?.agentId).toBe("translate");
  });

  it("falls back to defaultAgentId when no rule matches", () => {
    const routerConfig: RouterAgentConfig = {
      enabled: true,
      rules: [{ agentId: "research", keywords: ["research"] }],
      defaultAgentId: "default-agent",
    };
    const result = resolveRouterTarget({ cfg, routerConfig, message: "something else entirely" });
    expect(result?.agentId).toBe("default-agent");
    expect(result?.matched).toBe("default");
  });

  it("evaluates rules in order and uses the first match", () => {
    const routerConfig: RouterAgentConfig = {
      enabled: true,
      rules: [
        { agentId: "research", keywords: ["find"] },
        { agentId: "translate", keywords: ["find"] },
      ],
    };
    const result = resolveRouterTarget({ cfg, routerConfig, message: "find something" });
    expect(result?.agentId).toBe("research");
  });

  it("skips invalid regex patterns without throwing", () => {
    const routerConfig: RouterAgentConfig = {
      enabled: true,
      rules: [
        { agentId: "research", pattern: "[invalid(regex" },
        { agentId: "translate", keywords: ["translate"] },
      ],
      defaultAgentId: "default-agent",
    };
    // Should not throw; invalid regex is skipped
    expect(() =>
      resolveRouterTarget({ cfg, routerConfig, message: "translate this" }),
    ).not.toThrow();
    const result = resolveRouterTarget({ cfg, routerConfig, message: "translate this" });
    expect(result?.agentId).toBe("translate");
  });

  it("uses the agent display name from config when available", () => {
    const routerConfig: RouterAgentConfig = {
      enabled: true,
      rules: [{ agentId: "research", keywords: ["find"] }],
    };
    const result = resolveRouterTarget({ cfg, routerConfig, message: "find docs" });
    expect(result?.agentName).toBe("Research");
  });
});

// ── parseRouterStatusQuery ───────────────────────────────────────────────────

describe("parseRouterStatusQuery", () => {
  it("parses 'status <taskId>'", () => {
    const q = parseRouterStatusQuery("status t-abc12345");
    expect(q?.type).toBe("status");
    if (q?.type === "status") {
      expect(q.taskId).toBe("t-abc12345");
    }
  });

  it("parses '/status <taskId>'", () => {
    const q = parseRouterStatusQuery("/status t-abc12345");
    expect(q?.type).toBe("status");
  });

  it("parses 'task <taskId>' as status", () => {
    const q = parseRouterStatusQuery("task t-abc12345");
    expect(q?.type).toBe("status");
  });

  it("parses 'tasks <agentId>'", () => {
    const q = parseRouterStatusQuery("tasks research");
    expect(q?.type).toBe("tasks");
    if (q?.type === "tasks") {
      expect(q.agentId).toBe("research");
    }
  });

  it("parses 'jobs <agentId>'", () => {
    const q = parseRouterStatusQuery("jobs translate");
    expect(q?.type).toBe("tasks");
  });

  it("parses 'tasks' alone as list", () => {
    const q = parseRouterStatusQuery("tasks");
    expect(q?.type).toBe("list");
  });

  it("parses '/jobs' alone as list", () => {
    const q = parseRouterStatusQuery("/jobs");
    expect(q?.type).toBe("list");
  });

  it("returns null for regular messages", () => {
    expect(parseRouterStatusQuery("please help me find docs")).toBeNull();
    expect(parseRouterStatusQuery("")).toBeNull();
    expect(parseRouterStatusQuery("hello world")).toBeNull();
  });

  it("is case-insensitive", () => {
    const q = parseRouterStatusQuery("STATUS t-abc12345");
    expect(q?.type).toBe("status");
  });
});

// ── Reply formatting ─────────────────────────────────────────────────────────

describe("formatTaskAcceptedReply", () => {
  it("includes the task ID", () => {
    const text = formatTaskAcceptedReply({
      taskId: "t-abc12345",
      agentId: "research",
      agentName: "Research",
    });
    expect(text).toContain("t-abc12345");
  });

  it("includes the agent name", () => {
    const text = formatTaskAcceptedReply({
      taskId: "t-abc12345",
      agentId: "research",
      agentName: "Research",
    });
    expect(text).toContain("Research");
  });
});

describe("formatTaskNotFoundReply", () => {
  it("mentions the task ID", () => {
    const text = formatTaskNotFoundReply("t-unknown0");
    expect(text).toContain("t-unknown0");
  });
});

describe("formatJobStatusReply", () => {
  it("includes task ID, agent name, and status", () => {
    const job = makeJob({ status: "running" });
    const text = formatJobStatusReply(job);
    expect(text).toContain(job.taskId);
    expect(text).toContain(job.agentName);
    expect(text).toContain("running");
  });

  it("includes error details when present", () => {
    const job = makeJob({ status: "error", error: "LLM timeout" });
    const text = formatJobStatusReply(job);
    expect(text).toContain("LLM timeout");
  });
});

describe("formatAgentTasksReply", () => {
  it("shows task count", () => {
    const jobs = [makeJob(), makeJob({ taskId: "t-xxxxxxxx" })];
    const text = formatAgentTasksReply({ agentId: "research", tasks: jobs });
    expect(text).toContain("2");
  });

  it("shows no-tasks message when empty", () => {
    const text = formatAgentTasksReply({ agentId: "research", tasks: [] });
    expect(text).toContain("No tasks");
    expect(text).toContain("research");
  });
});

describe("formatAllTasksReply", () => {
  it("shows no-tasks message when empty", () => {
    const text = formatAllTasksReply([]);
    expect(text).toContain("No tasks");
  });

  it("shows total task count", () => {
    const jobs = [makeJob(), makeJob({ taskId: "t-xxxxxxxx" })];
    const text = formatAllTasksReply(jobs);
    expect(text).toContain("2");
  });
});
