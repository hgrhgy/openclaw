import { createDefaultDeps } from "../../cli/deps.js";
import { agentCommandFromIngress } from "../../commands/agent.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { jobStore } from "../../routing/job-store.js";
import type { ResolvedRouterTarget } from "../../routing/router-agent.js";
import { defaultRuntime } from "../../runtime.js";
import type { FinalizedMsgContext } from "../templating.js";

const log = createSubsystemLogger("auto-reply/router-agent-dispatch");

/**
 * Fire-and-forget dispatch of the user's message to the router's target agent.
 *
 * Updates the job status in the shared `jobStore` as the run progresses.
 * Never throws — errors are caught and recorded in the job store.
 */
export async function dispatchToRouterTarget(params: {
  ctx: FinalizedMsgContext;
  target: ResolvedRouterTarget;
  taskId: string;
}): Promise<void> {
  const { ctx, target, taskId } = params;

  const message = ctx.Body ?? "";
  // Best-effort delivery route from the inbound context
  const channel = ctx.OriginatingChannel ?? ctx.Surface ?? ctx.Provider ?? undefined;
  const to = ctx.OriginatingTo ?? ctx.To ?? undefined;
  const accountId = typeof ctx.AccountId === "string" ? ctx.AccountId : undefined;
  const threadId = ctx.MessageThreadId != null ? String(ctx.MessageThreadId) : undefined;

  const shouldDeliver = Boolean(channel && to);

  jobStore.updateStatus(taskId, "running");

  try {
    log.info(
      `dispatching router task: taskId=${taskId} targetAgent=${target.agentId} deliver=${shouldDeliver}`,
    );

    await agentCommandFromIngress(
      {
        message,
        agentId: target.agentId,
        deliver: shouldDeliver,
        channel: shouldDeliver ? channel : undefined,
        replyChannel: shouldDeliver ? channel : undefined,
        to: shouldDeliver ? to : undefined,
        accountId: accountId,
        threadId,
        senderIsOwner: false,
        spawnedBy: `router:${taskId}`,
        runId: taskId,
      },
      defaultRuntime,
      createDefaultDeps(),
    );

    jobStore.updateStatus(taskId, "done");
    log.info(`router task completed: taskId=${taskId}`);
  } catch (err) {
    const errorMsg = String(err);
    log.error(`router task failed: taskId=${taskId} error="${errorMsg}"`);
    jobStore.updateStatus(taskId, "error", errorMsg);
  }
}
