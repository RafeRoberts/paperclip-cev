export const type = "http_agent";
export const label = "HTTP Agent";

export const agentConfigurationDoc = `# HTTP Agent Adapter

Connect any external agent that exposes an HTTP endpoint. The adapter sends task
payloads via POST and parses structured JSON responses including cost reporting,
session state, subtask delegation, and approval gates.

## Required Configuration

- **url** — The agent endpoint that receives task payloads (e.g. \`http://localhost:8080/agent/execute\`)

## Optional Configuration

- **method** — HTTP method (default: \`POST\`)
- **headers** — Custom request headers (supports \`\${secrets.key}\` interpolation)
- **healthCheckUrl** — Endpoint for health/readiness probes
- **timeoutSec** — Request timeout in seconds (default: 300)
- **retryAttempts** — Number of retries on failure (default: 0)
- **retryDelaySec** — Delay between retries in seconds (default: 5)
- **responseFormat** — Expected response format: \`json\` (default) or \`text\`
- **costExtraction.field** — JSON path in response for cost in cents
- **costExtraction.fallbackCentsPerCall** — Fallback cost if agent doesn't report it
- **sessionStrategy** — How to pass session ID: \`header\`, \`body\`, or \`none\` (default: \`body\`)
- **sessionHeaderName** — Header name for session ID when strategy is \`header\`

## Request Payload

The adapter POSTs a JSON payload to the configured URL:

\`\`\`json
{
  "task": { "issueId": "...", "title": "...", "description": "...", "context": { ... } },
  "agent": { "id": "...", "name": "...", "role": "..." },
  "company": { "id": "..." },
  "session": { "id": "...", "params": { ... } },
  "paperclip": { "apiUrl": "http://localhost:3100", "runId": "..." }
}
\`\`\`

## Expected Response

\`\`\`json
{
  "status": "completed",
  "output": "Result text...",
  "cost_cents": 12,
  "session": { "id": "...", "state": { ... } },
  "subtasks": [
    { "title": "...", "description": "...", "assignTo": "agent_id", "priority": "high" }
  ],
  "metadata": { ... }
}
\`\`\`

### Response Status Values

- \`completed\` — Task finished successfully
- \`failed\` — Task failed (error info in output)
- \`needs_approval\` — Requires human approval before proceeding
`;
