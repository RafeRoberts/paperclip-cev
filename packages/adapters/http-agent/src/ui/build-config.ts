import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildHttpAgentConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.url) ac.url = v.url;
  ac.method = "POST";
  ac.timeoutSec = 300;
  ac.responseFormat = "json";
  ac.sessionStrategy = "body";
  return ac;
}
