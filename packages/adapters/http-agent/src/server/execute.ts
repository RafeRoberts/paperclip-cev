import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import type { HttpAgentConfig, HttpAgentRequestPayload, HttpAgentResponse } from "../shared/schema.js";
import { parseAgentResponse } from "./parse.js";

function resolveApiUrl(): string {
  if (process.env.PAPERCLIP_API_URL) return process.env.PAPERCLIP_API_URL;
  const host = process.env.PAPERCLIP_LISTEN_HOST ?? process.env.HOST ?? "localhost";
  const resolvedHost = (!host || host === "0.0.0.0" || host === "::") ? "localhost" : host;
  const port = process.env.PAPERCLIP_LISTEN_PORT ?? process.env.PORT ?? "3100";
  return `http://${resolvedHost}:${port}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { config, runId, agent, runtime, context, onLog } = ctx;
  const cfg = config as unknown as HttpAgentConfig;

  const url = cfg.url;
  if (!url) {
    throw new Error("http_agent adapter requires a url in adapterConfig");
  }

  const method = (cfg.method ?? "POST").toUpperCase();
  const timeoutMs = (cfg.timeoutSec ?? 300) * 1000;
  const retryAttempts = cfg.retryAttempts ?? 0;
  const retryDelaySec = cfg.retryDelaySec ?? 5;
  const responseFormat = cfg.responseFormat ?? "json";
  const sessionStrategy = cfg.sessionStrategy ?? "body";

  // Build request payload
  // The heartbeat context contains issueId, taskId, wakeReason, wakeSource,
  // commentId, paperclipWorkspace, etc. — but NOT issue title/description.
  // We pass the full context so the agent endpoint has everything available.
  const payload: HttpAgentRequestPayload = {
    task: {
      issueId: (context.issueId as string) ?? (context.taskId as string) ?? null,
      title: (context.wakeReason as string) ?? null,
      description: (context.wakeTriggerDetail as string) ?? null,
      context,
    },
    agent: {
      id: agent.id,
      name: agent.name,
      role: null,
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

  // Build request headers
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...cfg.headers,
  };

  // Session via header
  if (sessionStrategy === "header" && runtime.sessionId) {
    const headerName = cfg.sessionHeaderName ?? "X-Session-ID";
    headers[headerName] = runtime.sessionId;
  }

  // Remove session from body if strategy is not body
  if (sessionStrategy !== "body") {
    payload.session = { id: null, params: null };
  }

  await onLog("stdout", `HTTP ${method} ${url}`);

  let lastError: Error | null = null;
  const maxAttempts = 1 + retryAttempts;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await onLog("stderr", `Retry attempt ${attempt - 1}/${retryAttempts} after ${retryDelaySec}s delay`);
      await sleep(retryDelaySec * 1000);
    }

    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (timer) clearTimeout(timer);

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        lastError = new Error(`HTTP ${res.status}: ${bodyText.slice(0, 500)}`);
        await onLog("stderr", `Agent responded with HTTP ${res.status}`);
        if (attempt < maxAttempts) continue;
        return {
          exitCode: 1,
          signal: null,
          timedOut: false,
          errorMessage: lastError.message,
          summary: `HTTP ${method} ${url} — ${res.status}`,
        };
      }

      // Parse response based on format
      if (responseFormat === "text") {
        const text = await res.text();
        await onLog("stdout", text);
        return {
          exitCode: 0,
          signal: null,
          timedOut: false,
          summary: `HTTP ${method} ${url} — 200`,
          resultJson: { output: text },
        };
      }

      // JSON response — parse structured agent response
      const rawBody = await res.text();
      await onLog("stdout", rawBody);

      let parsed: HttpAgentResponse;
      try {
        parsed = JSON.parse(rawBody) as HttpAgentResponse;
      } catch {
        // Non-JSON response treated as plain text output
        return {
          exitCode: 0,
          signal: null,
          timedOut: false,
          summary: `HTTP ${method} ${url} — 200`,
          resultJson: { output: rawBody },
        };
      }

      return parseAgentResponse(parsed, cfg, url, method);
    } catch (err) {
      if (timer) clearTimeout(timer);

      if (err instanceof DOMException && err.name === "AbortError") {
        return {
          exitCode: null,
          signal: "SIGTERM",
          timedOut: true,
          errorMessage: `Request timed out after ${cfg.timeoutSec ?? 300}s`,
          summary: `HTTP ${method} ${url} — timeout`,
        };
      }

      lastError = err instanceof Error ? err : new Error(String(err));
      await onLog("stderr", `Request failed: ${lastError.message}`);
      if (attempt < maxAttempts) continue;
    }
  }

  return {
    exitCode: 1,
    signal: null,
    timedOut: false,
    errorMessage: lastError?.message ?? "Unknown error",
    summary: `HTTP ${method} ${url} — failed after ${maxAttempts} attempts`,
  };
}
