import { randomUUID } from "node:crypto";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("routing/job-store");

/** Lifecycle status of a routed task. */
export type JobStatus = "queued" | "running" | "done" | "error";

export type JobEntry = {
  /** Short unique identifier, e.g. `t-3abc1f45`. */
  taskId: string;
  /** Agent that will process the task. */
  agentId: string;
  /** Human-readable agent name (falls back to agentId). */
  agentName: string;
  /** Original user message text. */
  userMessage: string;
  /** Unix epoch ms when the job was submitted. */
  submittedAt: number;
  /** Monotonic insertion sequence — used for stable newest-first ordering. */
  seq: number;
  /** Current lifecycle status. */
  status: JobStatus;
  /** Optional session key of the agent run. */
  sessionKey?: string;
  /** Unix epoch ms when the job finished (done or error). */
  completedAt?: number;
  /** Error message when status is "error". */
  error?: string;
};

/** Jobs older than this are pruned from the in-memory store. */
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory job/task store for the router agent system.
 *
 * Jobs are kept for up to 24 hours.  A single process-singleton is exported
 * (`jobStore`) so every part of the gateway shares the same store without
 * needing dependency-injection wiring.
 */
export class JobStore {
  private readonly jobs = new Map<string, JobEntry>();
  private nextSeq = 0;

  private prune(now = Date.now()): void {
    const cutoff = now - JOB_TTL_MS;
    for (const [taskId, entry] of this.jobs) {
      if (entry.submittedAt < cutoff) {
        this.jobs.delete(taskId);
      }
    }
  }

  /** Create and store a new job.  Returns the persisted entry with taskId set. */
  submit(input: Omit<JobEntry, "taskId" | "submittedAt" | "status" | "seq">): JobEntry {
    const now = Date.now();
    this.prune(now);
    const entry: JobEntry = {
      ...input,
      taskId: generateTaskId(),
      submittedAt: now,
      seq: this.nextSeq++,
      status: "queued",
    };
    // Store with lowercase key so case-insensitive lookups always match.
    this.jobs.set(entry.taskId.toLowerCase(), entry);
    log.info(`job submitted: taskId=${entry.taskId} agentId=${entry.agentId}`);
    return entry;
  }

  /** Look up a job by its task ID. Returns undefined when not found. */
  getByTaskId(taskId: string): JobEntry | undefined {
    return this.jobs.get(taskId.trim().toLowerCase());
  }

  /**
   * Return all jobs for a given agent, newest-first.
   * Returns an empty array when no jobs are found.
   */
  getByAgentId(agentId: string): JobEntry[] {
    const normalized = agentId.trim().toLowerCase();
    const result: JobEntry[] = [];
    for (const entry of this.jobs.values()) {
      if (entry.agentId.toLowerCase() === normalized) {
        result.push(entry);
      }
    }
    return result.toSorted((a, b) => b.seq - a.seq);
  }

  /** List all jobs, newest-first. */
  listAll(): JobEntry[] {
    return [...this.jobs.values()].toSorted((a, b) => b.seq - a.seq);
  }

  /**
   * Update the status of a job.
   * Returns true when the job was found and updated, false otherwise.
   */
  updateStatus(taskId: string, status: JobStatus, error?: string): boolean {
    const entry = this.jobs.get(taskId.trim().toLowerCase());
    if (!entry) {
      return false;
    }
    entry.status = status;
    if (status === "done" || status === "error") {
      entry.completedAt = Date.now();
    }
    if (typeof error === "string") {
      entry.error = error;
    }
    log.info(`job status updated: taskId=${taskId} status=${status}`);
    return true;
  }

  /** Number of jobs currently tracked (including completed). */
  get size(): number {
    return this.jobs.size;
  }

  /** Remove all jobs — primarily for testing. */
  clear(): void {
    this.jobs.clear();
    this.nextSeq = 0;
  }
}

function generateTaskId(): string {
  return `t-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

/** Process-singleton job store shared across the gateway. */
export const jobStore = new JobStore();
