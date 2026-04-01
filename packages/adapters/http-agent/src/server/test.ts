import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import type { HttpAgentConfig } from "../shared/schema.js";
import { checkHealth } from "./health.js";

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
  const cfg = ctx.config as unknown as HttpAgentConfig;

  // Validate URL
  if (!cfg.url) {
    checks.push({
      code: "http_agent_url_missing",
      level: "error",
      message: "HTTP Agent adapter requires a URL.",
      hint: "Set adapterConfig.url to the agent's execution endpoint.",
    });
    return { adapterType: ctx.adapterType, status: "fail", checks, testedAt: new Date().toISOString() };
  }

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(cfg.url);
  } catch {
    checks.push({
      code: "http_agent_url_invalid",
      level: "error",
      message: `Invalid URL: ${cfg.url}`,
    });
  }

  if (parsedUrl && parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    checks.push({
      code: "http_agent_url_protocol",
      level: "error",
      message: `Unsupported URL protocol: ${parsedUrl.protocol}`,
      hint: "Use an http:// or https:// endpoint.",
    });
  }

  if (parsedUrl) {
    checks.push({
      code: "http_agent_url_valid",
      level: "info",
      message: `Agent endpoint: ${parsedUrl.toString()}`,
    });
  }

  // Validate timeout
  if (cfg.timeoutSec != null && cfg.timeoutSec <= 0) {
    checks.push({
      code: "http_agent_timeout_invalid",
      level: "warn",
      message: "timeoutSec should be a positive number.",
    });
  }

  // Validate retry config
  if (cfg.retryAttempts != null && cfg.retryAttempts < 0) {
    checks.push({
      code: "http_agent_retry_invalid",
      level: "warn",
      message: "retryAttempts should be a non-negative number.",
    });
  }

  // Probe the health check endpoint if configured
  const healthUrl = cfg.healthCheckUrl;
  if (healthUrl) {
    const healthResult = await checkHealth(healthUrl);
    if (healthResult.ok) {
      checks.push({
        code: "http_agent_health_ok",
        level: "info",
        message: `Health endpoint responded OK (${healthResult.statusCode}).`,
      });
    } else {
      checks.push({
        code: "http_agent_health_failed",
        level: "warn",
        message: healthResult.error ?? `Health check returned ${healthResult.statusCode}`,
        hint: "The agent may not be running. Verify connectivity when invoking runs.",
      });
    }
  } else if (parsedUrl) {
    // Probe the main URL with HEAD as fallback
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(parsedUrl, { method: "HEAD", signal: controller.signal });
      if (res.ok || res.status === 405 || res.status === 501) {
        checks.push({
          code: "http_agent_probe_ok",
          level: "info",
          message: "Agent endpoint responded to HEAD probe.",
        });
      } else {
        checks.push({
          code: "http_agent_probe_status",
          level: "warn",
          message: `Endpoint probe returned HTTP ${res.status}.`,
          hint: "Verify the endpoint is reachable from the Paperclip server.",
        });
      }
    } catch {
      checks.push({
        code: "http_agent_probe_failed",
        level: "warn",
        message: "Could not reach agent endpoint.",
        hint: "The agent may not be running yet. This is fine if it starts on demand.",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
