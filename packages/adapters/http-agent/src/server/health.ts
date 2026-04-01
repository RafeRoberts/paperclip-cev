/**
 * Perform a health check against the agent's health endpoint.
 * Returns true if the endpoint is reachable and responds with 2xx.
 */
export async function checkHealth(
  healthCheckUrl: string,
  timeoutMs: number = 5000,
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(healthCheckUrl, {
      method: "GET",
      signal: controller.signal,
    });
    return { ok: res.ok, statusCode: res.status };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: `Health check timed out after ${timeoutMs}ms` };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Health check failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
