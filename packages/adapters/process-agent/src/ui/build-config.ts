import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildProcessAgentConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.command) ac.command = v.command;
  if (v.args) {
    const parts = v.args.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) ac.args = parts;
  }
  ac.inputMode = "stdin";
  ac.outputMode = "stdout_json";
  ac.timeoutSec = 600;
  ac.graceSec = 30;
  return ac;
}
