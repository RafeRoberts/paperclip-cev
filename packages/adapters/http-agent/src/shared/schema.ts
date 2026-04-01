// ---------------------------------------------------------------------------
// HTTP Agent adapter configuration schema
// ---------------------------------------------------------------------------

/** Shape of the adapterConfig for http_agent agents. */
export interface HttpAgentConfig {
  /** Agent endpoint URL (required). */
  url: string;
  /** HTTP method. Default: POST */
  method?: string;
  /** Custom request headers. Values may contain ${secrets.key} refs. */
  headers?: Record<string, string>;
  /** Health check endpoint for readiness probes. */
  healthCheckUrl?: string;
  /** Request timeout in seconds. Default: 300 */
  timeoutSec?: number;
  /** Number of retry attempts on failure. Default: 0 */
  retryAttempts?: number;
  /** Delay between retries in seconds. Default: 5 */
  retryDelaySec?: number;
  /** Expected response format. Default: json */
  responseFormat?: "json" | "text";
  /** How to extract cost from the response. */
  costExtraction?: {
    /** JSON field name in response containing cost in cents. Default: cost_cents */
    field?: string;
    /** Fallback cost per call in cents if agent doesn't report cost. Default: 0 */
    fallbackCentsPerCall?: number;
  };
  /** How to pass session ID to the agent. Default: body */
  sessionStrategy?: "header" | "body" | "none";
  /** Header name when sessionStrategy is 'header'. Default: X-Session-ID */
  sessionHeaderName?: string;
  /** Environment variables injected alongside PAPERCLIP_* vars. */
  env?: Record<string, unknown>;
}

/** Shape of the request payload sent to the agent. */
export interface HttpAgentRequestPayload {
  task: {
    issueId?: string | null;
    title?: string | null;
    description?: string | null;
    context: Record<string, unknown>;
  };
  agent: {
    id: string;
    name: string;
    role?: string | null;
  };
  company: {
    id: string;
  };
  session: {
    id: string | null;
    params: Record<string, unknown> | null;
  };
  paperclip: {
    apiUrl: string;
    runId: string;
  };
}

/** Shape of the expected response from the agent. */
export interface HttpAgentResponse {
  /** Execution status. */
  status: "completed" | "failed" | "needs_approval" | "plan_ready";
  /** Human-readable output / result text. */
  output?: string;
  /** Cost in cents for this execution. */
  cost_cents?: number;
  /** Session state to persist for next invocation. */
  session?: {
    id?: string;
    state?: Record<string, unknown>;
  } | null;
  /** Optional subtasks to create as child issues. */
  subtasks?: Array<{
    title: string;
    description?: string;
    assignTo?: string;
    priority?: string;
    requiresApproval?: boolean;
  }>;
  /** Arbitrary metadata from the agent. */
  metadata?: Record<string, unknown>;
  /** CEW action type if the agent is requesting a governance action. */
  action_type?: "use_tool" | "build_tool" | "add_agent";
  /** Structured payload for governance actions (tool spec, agent spec, etc.). */
  action_payload?: Record<string, unknown>;
  /** Tool name for use_tool actions. */
  tool?: string;
  /** Plan text when agent submits an execution plan for approval. */
  plan?: string;
}
