import type { AdapterExecutionResult } from "@paperclipai/adapter-utils";
import type { RunProcessResult } from "@paperclipai/adapter-utils/server-utils";
import type { ProcessAgentConfig, ProcessAgentResponse } from "../shared/schema.js";

/**
 * Parse the stdout of a completed process agent into an AdapterExecutionResult.
 * Expects JSON matching the ProcessAgentResponse schema.
 * Falls back gracefully to raw text if JSON parsing fails.
 */
export function parseProcessOutput(
  stdout: string,
  proc: RunProcessResult,
  config: ProcessAgentConfig,
): AdapterExecutionResult {
  const exitCode = proc.exitCode ?? 0;
  const isApproval = exitCode === 42;

  // Try to parse as JSON
  let parsed: ProcessAgentResponse | null = null;
  const trimmed = stdout.trim();
  if (trimmed.startsWith("{")) {
    try {
      // If stdout contains multiple lines, try the last JSON line
      // (agent may have logged non-JSON before the final result)
      const lines = trimmed.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("{")) {
          try {
            parsed = JSON.parse(line) as ProcessAgentResponse;
            break;
          } catch {
            continue;
          }
        }
      }
      // If no individual line parsed, try the whole thing
      if (!parsed) {
        parsed = JSON.parse(trimmed) as ProcessAgentResponse;
      }
    } catch {
      // Not valid JSON — treat as raw text
    }
  }

  if (!parsed) {
    // Fallback: raw text output
    const result: AdapterExecutionResult = {
      exitCode: exitCode !== 0 && !isApproval ? exitCode : 0,
      signal: proc.signal,
      timedOut: false,
      resultJson: { output: stdout, stdout: proc.stdout, stderr: proc.stderr },
    };
    if (exitCode !== 0 && !isApproval) {
      result.errorMessage = `Process exited with code ${exitCode}`;
    }
    if (isApproval) {
      result.question = {
        prompt: stdout || "The agent is requesting approval to proceed.",
        choices: [
          { key: "approve", label: "Approve", description: "Allow the agent to continue" },
          { key: "deny", label: "Deny", description: "Reject and stop the agent" },
        ],
      };
    }
    if (config.costEstimateCentsPerRun) {
      result.costUsd = config.costEstimateCentsPerRun / 100;
      result.billingType = "fixed";
    }
    return result;
  }

  // Structured JSON response
  const status = parsed.status ?? (isApproval ? "needs_approval" : exitCode !== 0 ? "failed" : "completed");
  const output = parsed.output ?? "";

  // Cost extraction
  let costUsd: number | null = null;
  if (typeof parsed.cost_cents === "number" && parsed.cost_cents > 0) {
    costUsd = parsed.cost_cents / 100;
  } else if (config.costEstimateCentsPerRun) {
    costUsd = config.costEstimateCentsPerRun / 100;
  }

  // Session extraction
  let sessionId: string | null = null;
  let sessionParams: Record<string, unknown> | null = null;
  if (parsed.session) {
    sessionId = parsed.session.id ?? null;
    sessionParams = parsed.session.state ?? null;
  }

  // Build resultJson
  const resultJson: Record<string, unknown> = {
    output,
    status,
    stdout: proc.stdout,
    stderr: proc.stderr,
  };
  if (parsed.subtasks && parsed.subtasks.length > 0) {
    resultJson.subtasks = parsed.subtasks;
  }
  if (parsed.metadata) {
    resultJson.metadata = parsed.metadata;
  }

  const result: AdapterExecutionResult = {
    exitCode: status === "failed" ? (exitCode !== 0 ? exitCode : 1) : 0,
    signal: proc.signal,
    timedOut: false,
    errorMessage: status === "failed" ? (output || "Agent reported failure") : null,
    costUsd,
    billingType: costUsd != null ? "fixed" : null,
    sessionId,
    sessionParams,
    resultJson,
    summary: `process_agent ${config.command} — ${status}`,
  };

  if (status === "needs_approval") {
    result.question = {
      prompt: output || "The agent is requesting approval to proceed.",
      choices: [
        { key: "approve", label: "Approve", description: "Allow the agent to continue" },
        { key: "deny", label: "Deny", description: "Reject and stop the agent" },
      ],
    };
  }

  return result;
}
