import * as path from "node:path";
import * as fs from "node:fs/promises";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  buildPaperclipEnv,
  redactEnvForLogs,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import type { ProcessAgentConfig, ProcessAgentInputPayload } from "../shared/schema.js";
import { parseProcessOutput } from "./parse.js";

function resolveApiUrl(): string {
  if (process.env.PAPERCLIP_API_URL) return process.env.PAPERCLIP_API_URL;
  const host = process.env.PAPERCLIP_LISTEN_HOST ?? process.env.HOST ?? "localhost";
  const resolvedHost = (!host || host === "0.0.0.0" || host === "::") ? "localhost" : host;
  const port = process.env.PAPERCLIP_LISTEN_PORT ?? process.env.PORT ?? "3100";
  return `http://${resolvedHost}:${port}`;
}

function tryParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const lines = trimmed.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{")) {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function handleGovernanceResponse(
  parsed: Record<string, unknown>,
  command: string,
  baseResult: AdapterExecutionResult,
): AdapterExecutionResult {
  // Plan approval gate
  if (parsed.status === "plan_ready" || parsed.plan) {
    return {
      ...baseResult,
      exitCode: 0,
      resultJson: {
        ...(baseResult.resultJson as Record<string, unknown> ?? {}),
        status: "needs_approval",
        approvalType: "plan_approval",
        plan: (parsed.plan ?? parsed.output ?? "") as string,
      },
      question: {
        prompt: (parsed.plan ?? parsed.output ?? "Execution plan requires approval.") as string,
        choices: [
          { key: "approve", label: "Approve Plan", description: "Allow the agent to proceed" },
          { key: "reject", label: "Reject Plan", description: "Reject and provide feedback" },
          { key: "rework", label: "Request Rework", description: "Send back for revision" },
        ],
      },
      summary: `process_agent ${command} — plan_ready`,
    };
  }

  // CEW action type gates
  if (parsed.action_type) {
    const actionLabels: Record<string, string> = {
      use_tool: "Tool use requires approval",
      build_tool: "Tool creation requires board approval",
      add_agent: "Agent creation requires board approval",
    };

    return {
      ...baseResult,
      exitCode: 0,
      resultJson: {
        ...(baseResult.resultJson as Record<string, unknown> ?? {}),
        status: "needs_approval",
        approvalType: parsed.action_type as string,
        actionType: parsed.action_type as string,
        actionPayload: (parsed.action_payload ?? {}) as Record<string, unknown>,
        tool: parsed.tool as string | undefined,
      },
      question: {
        prompt: (actionLabels[parsed.action_type as string] ?? "Action requires approval") as string,
        choices: [
          { key: "approve", label: "Approve", description: "Allow this action" },
          { key: "deny", label: "Deny", description: "Reject this action" },
        ],
      },
      summary: `process_agent ${command} — ${parsed.action_type}_pending`,
    };
  }

  return baseResult;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta } = ctx;
  const cfg = config as unknown as ProcessAgentConfig;

  const command = cfg.command;
  if (!command) {
    throw new Error("process_agent adapter requires a command in adapterConfig");
  }

  const args = cfg.args ?? [];
  const cwd = cfg.cwd ?? process.cwd();
  const inputMode = cfg.inputMode ?? "stdin";
  const outputMode = cfg.outputMode ?? "stdout_json";
  const timeoutSec = cfg.timeoutSec ?? 600;
  const graceSec = cfg.graceSec ?? 30;

  // Build environment
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };

  // Activate Python venv if configured
  if (cfg.venvPath) {
    const binDir = path.join(cfg.venvPath, "bin");
    env.PATH = `${binDir}:${process.env.PATH ?? ""}`;
    env.VIRTUAL_ENV = cfg.venvPath;
  }

  // Merge user-configured env vars
  if (cfg.env) {
    for (const [k, v] of Object.entries(cfg.env)) {
      if (typeof v === "string") env[k] = v;
    }
  }

  // Build task payload
  const payload: ProcessAgentInputPayload = {
    task: {
      issueId: (context.issueId as string) ?? (context.taskId as string) ?? null,
      title: (context.wakeReason as string) ?? null,
      description: (context.wakeTriggerDetail as string) ?? null,
      context,
    },
    agent: {
      id: agent.id,
      name: agent.name,
    },
    company: {
      id: agent.companyId,
    },
    session: {
      id: runtime.sessionId ?? null,
      params: runtime.sessionParams ?? null,
    },
    paperclip: {
      apiUrl: resolveApiUrl(),
      runId,
    },
  };

  const payloadJson = JSON.stringify(payload);

  // Determine how to pass input
  const finalArgs = [...args];
  let stdin: string | undefined;

  switch (inputMode) {
    case "stdin":
      stdin = payloadJson;
      break;
    case "args":
      finalArgs.push(payloadJson);
      break;
    case "env":
      env.PAPERCLIP_TASK = payloadJson;
      break;
  }

  if (onMeta) {
    await onMeta({
      adapterType: "process_agent",
      command,
      cwd,
      commandArgs: finalArgs,
      env: redactEnvForLogs(env),
    });
  }

  await onLog("stdout", `Spawning: ${command} ${finalArgs.join(" ")}`);

  const proc = await runChildProcess(runId, command, finalArgs, {
    cwd,
    env,
    timeoutSec,
    graceSec,
    onLog,
    stdin,
  });

  if (proc.timedOut) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: true,
      errorMessage: `Process timed out after ${timeoutSec}s`,
    };
  }

  // Read output based on outputMode
  let outputText: string;

  switch (outputMode) {
    case "file": {
      const outputFile = cfg.outputFile;
      if (!outputFile) {
        return {
          exitCode: proc.exitCode,
          signal: proc.signal,
          timedOut: false,
          errorMessage: "outputMode is 'file' but no outputFile configured",
        };
      }
      try {
        outputText = await fs.readFile(outputFile, "utf-8");
      } catch (err) {
        return {
          exitCode: proc.exitCode,
          signal: proc.signal,
          timedOut: false,
          errorMessage: `Failed to read output file: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      break;
    }
    case "stdout_text":
    case "stdout_json":
    default:
      outputText = proc.stdout;
      break;
  }

  // Map exit code 42 to needs_approval convention
  const exitCode = proc.exitCode ?? 0;
  const isApproval = exitCode === 42;
  const isFailed = exitCode !== 0 && !isApproval;

  // For stdout_text mode, return raw text
  if (outputMode === "stdout_text") {
    const result: AdapterExecutionResult = {
      exitCode: isFailed ? exitCode : 0,
      signal: proc.signal,
      timedOut: false,
      resultJson: { output: outputText, stdout: proc.stdout, stderr: proc.stderr },
    };
    if (isFailed) {
      result.errorMessage = `Process exited with code ${exitCode}`;
    }
    if (isApproval) {
      result.question = {
        prompt: outputText || "The agent is requesting approval to proceed.",
        choices: [
          { key: "approve", label: "Approve", description: "Allow the agent to continue" },
          { key: "deny", label: "Deny", description: "Reject and stop the agent" },
        ],
      };
    }
    // Fallback cost
    if (cfg.costEstimateCentsPerRun) {
      result.costUsd = cfg.costEstimateCentsPerRun / 100;
      result.billingType = "fixed";
    }
    return result;
  }

  // For stdout_json mode, try to parse structured response
  const result = parseProcessOutput(outputText, proc, cfg);

  // Check for CEW governance action types in the parsed result
  const resultData = result.resultJson as Record<string, unknown> | undefined;
  if (resultData) {
    const parsedOutput = tryParseJson(outputText);
    if (parsedOutput && (parsedOutput.action_type || parsedOutput.plan || parsedOutput.status === "plan_ready")) {
      return handleGovernanceResponse(parsedOutput, cfg.command ?? "process", result);
    }
  }

  return result;
}
