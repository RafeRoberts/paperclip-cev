export const type = "process_agent";
export const label = "Process Agent";

export const agentConfigurationDoc = `# Process Agent Adapter

Run external agents as child processes (Python, Node.js, or any executable).
The adapter spawns the command, passes the task as input, and parses structured
JSON output for cost tracking, session state, subtask delegation, and approval gates.

## Required Configuration

- **command** — The command to execute (e.g. \`python3\`, \`node\`)
- **args** — Command arguments (e.g. \`["agents/arb_scanner.py"]\`)

## Optional Configuration

- **cwd** — Working directory for the process (absolute path)
- **inputMode** — How to pass the task payload: \`stdin\` (default), \`args\`, or \`env\`
- **outputMode** — How to read the result: \`stdout_json\` (default), \`stdout_text\`, or \`file\`
- **outputFile** — File path to read result from when outputMode is \`file\`
- **env** — Additional environment variables (merged with PAPERCLIP_* vars)
- **venvPath** — Python virtualenv path (prepended to PATH)
- **timeoutSec** — Process timeout in seconds (default: 600)
- **graceSec** — Grace period for SIGTERM before SIGKILL (default: 30)
- **costEstimateCentsPerRun** — Fallback cost per run in cents if the agent doesn't report cost

## Input/Output Contract

### Input (stdin JSON)

\`\`\`json
{
  "task": { "issueId": "...", "title": "...", "description": "...", "context": { ... } },
  "agent": { "id": "...", "name": "..." },
  "company": { "id": "..." },
  "session": { "id": "...", "params": { ... } },
  "paperclip": { "apiUrl": "http://localhost:3100", "runId": "..." }
}
\`\`\`

### Output (stdout JSON)

\`\`\`json
{
  "status": "completed",
  "output": "Result text...",
  "cost_cents": 5,
  "session": { "id": "...", "state": { ... } },
  "subtasks": [{ "title": "...", "assignTo": "agent_id" }],
  "metadata": { ... }
}
\`\`\`

### Exit Codes

- \`0\` — completed
- \`1\` — failed
- \`42\` — needs_approval (triggers Paperclip governance)
`;
