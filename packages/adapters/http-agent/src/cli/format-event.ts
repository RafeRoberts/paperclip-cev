export function formatHttpAgentEvent(line: string, _debug: boolean): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  // Try to render structured responses nicely
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed.status && parsed.output) {
        console.log(`[${parsed.status}] ${parsed.output}`);
        return;
      }
    } catch {
      // Not JSON, fall through
    }
  }

  console.log(trimmed);
}
