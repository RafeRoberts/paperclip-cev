import type { AdapterExecutionResult } from "@paperclipai/adapter-utils";
import type { HttpAgentConfig, HttpAgentResponse } from "../shared/schema.js";

/**
 * Parse a structured JSON response from an HTTP agent into an AdapterExecutionResult.
 */
export function parseAgentResponse(
  response: HttpAgentResponse,
  config: HttpAgentConfig,
  url: string,
  method: string,
): AdapterExecutionResult {
  const status = response.status ?? "completed";
  const output = response.output ?? "";

  // Cost extraction
  let costUsd: number | null = null;
  const costField = config.costExtraction?.field ?? "cost_cents";
  const rawCost = (response as unknown as Record<string, unknown>)[costField];
  if (typeof rawCost === "number" && rawCost > 0) {
    costUsd = rawCost / 100;
  } else if (config.costExtraction?.fallbackCentsPerCall) {
    costUsd = config.costExtraction.fallbackCentsPerCall / 100;
  }

  // Session extraction
  let sessionId: string | null = null;
  let sessionParams: Record<string, unknown> | null = null;
  if (response.session) {
    sessionId = response.session.id ?? null;
    sessionParams = response.session.state ?? null;
  }

  // Build resultJson including subtasks and metadata
  const resultJson: Record<string, unknown> = {
    output,
    status,
  };
  if (response.subtasks && response.subtasks.length > 0) {
    resultJson.subtasks = response.subtasks;
  }
  if (response.metadata) {
    resultJson.metadata = response.metadata;
  }

  // Map agent status to exit code
  let exitCode: number;
  let errorMessage: string | null = null;

  switch (status) {
    case "completed":
      exitCode = 0;
      break;
    case "failed":
      exitCode = 1;
      errorMessage = output || "Agent reported failure";
      break;
    case "needs_approval":
      exitCode = 0;
      // The question field triggers Paperclip's governance/approval system
      break;
    default:
      exitCode = 0;
  }

  const result: AdapterExecutionResult = {
    exitCode,
    signal: null,
    timedOut: false,
    errorMessage,
    costUsd,
    billingType: costUsd != null ? "fixed" : null,
    sessionId,
    sessionParams,
    resultJson,
    summary: `HTTP ${method} ${url} — ${status}`,
  };

  // For needs_approval, add a question so Paperclip's governance kicks in
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
