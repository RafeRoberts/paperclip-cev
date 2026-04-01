import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
} from "@paperclipai/adapter-utils/server-utils";
import type { ProcessAgentConfig } from "../shared/schema.js";

function summarizeStatus(
  checks: AdapterEnvironmentCheck[],
): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const cfg = ctx.config as unknown as ProcessAgentConfig;

  // Validate command
  if (!cfg.command) {
    checks.push({
      code: "process_agent_command_missing",
      level: "error",
      message: "Process Agent adapter requires a command.",
      hint: "Set adapterConfig.command to the executable (e.g. python3, node).",
    });
    return { adapterType: ctx.adapterType, status: "fail", checks, testedAt: new Date().toISOString() };
  }

  checks.push({
    code: "process_agent_command_set",
    level: "info",
    message: `Command: ${cfg.command}`,
  });

  // Validate cwd
  const cwd = cfg.cwd ?? process.cwd();
  try {
    ensureAbsoluteDirectory(cwd);
    checks.push({
      code: "process_agent_cwd_valid",
      level: "info",
      message: `Working directory: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "process_agent_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      hint: "Set adapterConfig.cwd to an existing absolute directory path.",
    });
  }

  // Build env for command resolution
  const env: Record<string, string> = {};
  if (cfg.venvPath) {
    const binDir = `${cfg.venvPath}/bin`;
    env.PATH = `${binDir}:${process.env.PATH ?? ""}`;
  }
  if (cfg.env) {
    for (const [k, v] of Object.entries(cfg.env)) {
      if (typeof v === "string") env[k] = v;
    }
  }

  // Check command is resolvable
  try {
    await ensureCommandResolvable(cfg.command, cwd, env);
    checks.push({
      code: "process_agent_command_found",
      level: "info",
      message: `Command '${cfg.command}' is resolvable in PATH.`,
    });
  } catch {
    checks.push({
      code: "process_agent_command_not_found",
      level: "warn",
      message: `Command '${cfg.command}' was not found in PATH.`,
      hint: cfg.venvPath
        ? `Check that the venv at ${cfg.venvPath} contains the command.`
        : "Verify the command is installed and available in the server's PATH.",
    });
  }

  // Validate venv if configured
  if (cfg.venvPath) {
    try {
      ensureAbsoluteDirectory(cfg.venvPath);
      checks.push({
        code: "process_agent_venv_valid",
        level: "info",
        message: `Python venv: ${cfg.venvPath}`,
      });
    } catch {
      checks.push({
        code: "process_agent_venv_invalid",
        level: "warn",
        message: `venvPath '${cfg.venvPath}' is not a valid directory.`,
        hint: "Ensure the virtual environment exists at the specified path.",
      });
    }
  }

  // Validate outputFile if outputMode is file
  if (cfg.outputMode === "file" && !cfg.outputFile) {
    checks.push({
      code: "process_agent_output_file_missing",
      level: "warn",
      message: "outputMode is 'file' but no outputFile is configured.",
      hint: "Set adapterConfig.outputFile to the path where the agent writes its result.",
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
