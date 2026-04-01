// ---------------------------------------------------------------------------
// Process Agent adapter configuration schema
// ---------------------------------------------------------------------------

/** Shape of the adapterConfig for process_agent agents. */
export interface ProcessAgentConfig {
  /** Command to execute (required). e.g. "python3", "node" */
  command: string;
  /** Command arguments. e.g. ["agents/arb_scanner.py"] */
  args?: string[];
  /** Working directory (absolute path). */
  cwd?: string;
  /** How to pass the task payload to the process. Default: stdin */
  inputMode?: "stdin" | "args" | "env";
  /** How to read the result from the process. Default: stdout_json */
  outputMode?: "stdout_json" | "stdout_text" | "file";
  /** File path to read result from when outputMode is "file". */
  outputFile?: string;
  /** Additional environment variables. */
  env?: Record<string, unknown>;
  /** Python virtualenv path. Prepended to PATH. */
  venvPath?: string;
  /** Process timeout in seconds. Default: 600 */
  timeoutSec?: number;
  /** Grace period for SIGTERM before SIGKILL in seconds. Default: 30 */
  graceSec?: number;
  /** Fallback cost per run in cents if agent doesn't report cost. Default: 0 */
  costEstimateCentsPerRun?: number;
}

/** Shape of the task payload passed to the process. */
export interface ProcessAgentInputPayload {
  task: {
    issueId?: string | null;
    title?: string | null;
    description?: string | null;
    context: Record<string, unknown>;
  };
  agent: {
    id: string;
    name: string;
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

/** Shape of the expected structured JSON output from the process. */
export interface ProcessAgentResponse {
  status?: "completed" | "failed" | "needs_approval" | "plan_ready";
  output?: string;
  cost_cents?: number;
  session?: {
    id?: string;
    state?: Record<string, unknown>;
  } | null;
  subtasks?: Array<{
    title: string;
    description?: string;
    assignTo?: string;
    priority?: string;
    requiresApproval?: boolean;
  }>;
  metadata?: Record<string, unknown>;
  /** CEW action type if the agent is requesting a governance action. */
  action_type?: "use_tool" | "build_tool" | "add_agent";
  /** Structured payload for governance actions. */
  action_payload?: Record<string, unknown>;
  /** Tool name for use_tool actions. */
  tool?: string;
  /** Plan text when agent submits an execution plan for approval. */
  plan?: string;
}
