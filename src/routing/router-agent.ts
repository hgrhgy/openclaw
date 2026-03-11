import { listAgentEntries } from "../agents/agent-scope.js";
import type { OpenClawConfig } from "../config/config.js";
import type { RouterAgentConfig } from "../config/types.agents.js";
import { formatDurationCompact } from "../infra/format-time/format-duration.js";
import type { JobEntry, JobStatus } from "./job-store.js";

// ── Target resolution ───────────────────────────────────────────────────────

export type ResolvedRouterTarget = {
  agentId: string;
  agentName: string;
  /** How the target was selected. */
  matched: "rule" | "default";
};

/**
 * Determine which downstream agent should handle a given user message by
 * evaluating the router's rules in order.
 *
 * Returns null when no target can be found (no matching rule **and** no
 * default configured).
 */
export function resolveRouterTarget(params: {
  cfg: OpenClawConfig;
  routerConfig: RouterAgentConfig;
  message: string;
}): ResolvedRouterTarget | null {
  const { routerConfig, message, cfg } = params;
  const msgLower = message.toLowerCase();

  if (routerConfig.rules) {
    for (const rule of routerConfig.rules) {
      // Keyword match (any keyword triggers the rule, case-insensitive)
      if (rule.keywords?.some((kw) => msgLower.includes(kw.toLowerCase()))) {
        const agentName = resolveAgentDisplayName(cfg, rule.agentId) ?? rule.name ?? rule.agentId;
        return { agentId: rule.agentId, agentName, matched: "rule" };
      }
      // Regex match
      if (rule.pattern) {
        try {
          if (new RegExp(rule.pattern, "i").test(message)) {
            const agentName =
              resolveAgentDisplayName(cfg, rule.agentId) ?? rule.name ?? rule.agentId;
            return { agentId: rule.agentId, agentName, matched: "rule" };
          }
        } catch {
          // Invalid regex pattern — skip silently
        }
      }
    }
  }

  const defaultId = routerConfig.defaultAgentId;
  if (defaultId) {
    const agentName = resolveAgentDisplayName(cfg, defaultId) ?? defaultId;
    return { agentId: defaultId, agentName, matched: "default" };
  }

  return null;
}

function resolveAgentDisplayName(cfg: OpenClawConfig, agentId: string): string | undefined {
  const entry = listAgentEntries(cfg).find((e) => e.id === agentId);
  return typeof entry?.name === "string" && entry.name.trim() ? entry.name.trim() : undefined;
}

// ── Status query parsing ────────────────────────────────────────────────────

export type RouterStatusQuery =
  | { type: "status"; taskId: string }
  | { type: "tasks"; agentId: string }
  | { type: "list" };

/**
 * Parse an inbound message as a router status query.
 *
 * Recognised patterns:
 *   `status <taskId>` / `/status <taskId>`
 *   `task <taskId>`   / `/task <taskId>`
 *   `tasks <agentId>` / `/tasks <agentId>`
 *   `jobs <agentId>`  / `/jobs <agentId>`
 *   `tasks`           / `/tasks`           (list all)
 *   `jobs`            / `/jobs`            (list all)
 *
 * Returns null when the message is not a recognised query.
 */
export function parseRouterStatusQuery(message: string): RouterStatusQuery | null {
  const trimmed = message.trim();

  const statusMatch = trimmed.match(/^\/?(status|task)\s+(\S+)$/i);
  if (statusMatch) {
    return { type: "status", taskId: statusMatch[2] };
  }

  const tasksWithAgentMatch = trimmed.match(/^\/?(tasks|jobs)\s+(\S+)$/i);
  if (tasksWithAgentMatch) {
    return { type: "tasks", agentId: tasksWithAgentMatch[2] };
  }

  const listMatch = trimmed.match(/^\/?(tasks|jobs)$/i);
  if (listMatch) {
    return { type: "list" };
  }

  return null;
}

// ── Reply formatting ────────────────────────────────────────────────────────

/**
 * Format the immediate confirmation reply sent back to the user when a task is
 * accepted by the router.
 */
export function formatTaskAcceptedReply(params: {
  taskId: string;
  agentId: string;
  agentName: string;
}): string {
  const { taskId, agentId, agentName } = params;
  const nameDisplay = agentName !== agentId ? `${agentName} (\`${agentId}\`)` : `\`${agentId}\``;
  return `✅ Task submitted\n🆔 Task ID: \`${taskId}\`\n🤖 Agent: ${nameDisplay}`;
}

/** Format a task-not-found error reply. */
export function formatTaskNotFoundReply(taskId: string): string {
  return `⚠️ No task found with ID \`${taskId}\``;
}

/** Format the status of a single job. */
export function formatJobStatusReply(job: JobEntry): string {
  const icon = statusIcon(job.status);
  const age = formatDurationCompact(Date.now() - job.submittedAt) ?? "just now";
  let text = `${icon} Task \`${job.taskId}\`\nAgent: **${job.agentName}** | Status: **${job.status}** | Submitted: ${age} ago`;
  if (job.error) {
    text += `\nError: ${job.error}`;
  }
  return text;
}

/** Format a list of jobs for a given agent. */
export function formatAgentTasksReply(params: { agentId: string; tasks: JobEntry[] }): string {
  const { agentId, tasks } = params;
  if (tasks.length === 0) {
    return `No tasks found for agent \`${agentId}\``;
  }
  const lines = tasks.slice(0, 10).map((t) => {
    const icon = statusIcon(t.status);
    const age = formatDurationCompact(Date.now() - t.submittedAt) ?? "just now";
    return `${icon} \`${t.taskId}\` – **${t.status}** (${age} ago)`;
  });
  const header = `Tasks for \`${agentId}\` (${tasks.length}):`;
  return `${header}\n${lines.join("\n")}`;
}

/** Format a full job list across all agents. */
export function formatAllTasksReply(tasks: JobEntry[]): string {
  if (tasks.length === 0) {
    return "No tasks submitted yet.";
  }
  const lines = tasks.slice(0, 15).map((t) => {
    const icon = statusIcon(t.status);
    const age = formatDurationCompact(Date.now() - t.submittedAt) ?? "just now";
    return `${icon} \`${t.taskId}\` → **${t.agentName}** – ${t.status} (${age} ago)`;
  });
  const suffix = tasks.length > 15 ? `\n…and ${tasks.length - 15} more` : "";
  return `All tasks (${tasks.length}):\n${lines.join("\n")}${suffix}`;
}

function statusIcon(status: JobStatus): string {
  switch (status) {
    case "queued":
      return "🕐";
    case "running":
      return "⏳";
    case "done":
      return "✅";
    case "error":
      return "❌";
    default:
      return "❓";
  }
}
