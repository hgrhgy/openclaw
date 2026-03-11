import type { ChatType } from "../channels/chat-type.js";
import type { AgentDefaultsConfig } from "./types.agent-defaults.js";
import type { AgentModelConfig, AgentSandboxConfig } from "./types.agents-shared.js";
import type { HumanDelayConfig, IdentityConfig } from "./types.base.js";
import type { GroupChatConfig } from "./types.messages.js";
import type { AgentToolsConfig, MemorySearchConfig } from "./types.tools.js";

export type AgentRuntimeAcpConfig = {
  /** ACP harness adapter id (for example codex, claude). */
  agent?: string;
  /** Optional ACP backend override for this agent runtime. */
  backend?: string;
  /** Optional ACP session mode override. */
  mode?: "persistent" | "oneshot";
  /** Optional runtime working directory override. */
  cwd?: string;
};

export type AgentRuntimeConfig =
  | {
      type: "embedded";
    }
  | {
      type: "acp";
      acp?: AgentRuntimeAcpConfig;
    };

export type AgentBindingMatch = {
  channel: string;
  accountId?: string;
  peer?: { kind: ChatType; id: string };
  guildId?: string;
  teamId?: string;
  /** Discord role IDs used for role-based routing. */
  roles?: string[];
};

export type AgentRouteBinding = {
  /** Missing type is interpreted as route for backward compatibility. */
  type?: "route";
  agentId: string;
  comment?: string;
  match: AgentBindingMatch;
};

export type AgentAcpBinding = {
  type: "acp";
  agentId: string;
  comment?: string;
  match: AgentBindingMatch;
  acp?: {
    mode?: "persistent" | "oneshot";
    label?: string;
    cwd?: string;
    backend?: string;
  };
};

export type AgentBinding = AgentRouteBinding | AgentAcpBinding;

/**
 * A single routing rule used by a router agent.
 *
 * Rules are evaluated in order; the first matching rule wins.
 * A rule matches when either `keywords` or `pattern` produces a match.
 */
export type RouterAgentRule = {
  /** Target agent ID to dispatch the message to. */
  agentId: string;
  /** Human-readable display name for the agent (falls back to agentId). */
  name?: string;
  /**
   * Case-insensitive keywords — if **any** keyword appears in the message
   * the rule matches.
   */
  keywords?: string[];
  /**
   * JavaScript-compatible regular expression string.
   * Tested against the full message with the `i` flag.
   * Invalid patterns are silently skipped.
   */
  pattern?: string;
};

/**
 * Configuration for the router/dispatcher mode of an agent.
 *
 * When `enabled: true`, the agent acts as a lightweight job-submission
 * router: it immediately replies to the IM with a task ID and the name of
 * the downstream agent that will handle the request, then dispatches the
 * message asynchronously to that agent.
 *
 * Users can query task status by sending `status <taskId>` or
 * `tasks <agentId>` to the router agent.
 */
export type RouterAgentConfig = {
  /** Must be `true` to activate router mode. */
  enabled: true;
  /**
   * Ordered list of routing rules.  The first rule whose `keywords` or
   * `pattern` matches the inbound message determines the target agent.
   */
  rules?: RouterAgentRule[];
  /**
   * Fallback agent ID used when no rule matches.
   * If omitted and no rule matches the router replies with an error.
   */
  defaultAgentId?: string;
};

export type AgentConfig = {
  id: string;
  default?: boolean;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: AgentModelConfig;
  /** Optional allowlist of skills for this agent (omit = all skills; empty = none). */
  skills?: string[];
  memorySearch?: MemorySearchConfig;
  /** Human-like delay between block replies for this agent. */
  humanDelay?: HumanDelayConfig;
  /** Optional per-agent heartbeat overrides. */
  heartbeat?: AgentDefaultsConfig["heartbeat"];
  identity?: IdentityConfig;
  groupChat?: GroupChatConfig;
  subagents?: {
    /** Allow spawning sub-agents under other agent ids. Use "*" to allow any. */
    allowAgents?: string[];
    /** Per-agent default model for spawned sub-agents (string or {primary,fallbacks}). */
    model?: AgentModelConfig;
  };
  /** Optional per-agent sandbox overrides. */
  sandbox?: AgentSandboxConfig;
  /** Optional per-agent stream params (e.g. cacheRetention, temperature). */
  params?: Record<string, unknown>;
  tools?: AgentToolsConfig;
  /** Optional runtime descriptor for this agent. */
  runtime?: AgentRuntimeConfig;
  /**
   * Router/dispatcher configuration.
   *
   * When set, this agent acts as a job-submission router rather than a
   * regular LLM agent: it immediately replies with a task ID and dispatches
   * the message to the appropriate downstream agent.
   */
  router?: RouterAgentConfig;
};

export type AgentsConfig = {
  defaults?: AgentDefaultsConfig;
  list?: AgentConfig[];
};
