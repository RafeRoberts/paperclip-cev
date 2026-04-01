import type { TranscriptEntry } from "@paperclipai/adapter-utils";

export function parseProcessAgentStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed.status && parsed.output) {
        return [{ kind: "assistant", ts, text: String(parsed.output) }];
      }
    } catch {
      // Not JSON, fall through
    }
  }
  return [{ kind: "stdout", ts, text: line }];
}
